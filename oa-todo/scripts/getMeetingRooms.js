#!/usr/bin/env node

/**
 * 会议室查询 RPA 脚本
 * 获取所有会议室、占用情况和可用时间段
 *
 * 使用方法：
 * node getMeetingRooms.js [startDate] [endDate]
 *
 * 示例：
 * node getMeetingRooms.js 2026-03-24 2026-03-26
 */

const fs = require('fs');

// 配置
const CONFIG = {
  stateFile: process.env.OA_STATE_FILE || `${process.env.HOME}/.oa-todo/login_state.json`,
  baseUrl: 'https://oa.xgd.com',
  apiEndpoint: '/km/imeeting/km_imeeting_calendar/kmImeetingCalendar.do?method=rescalendar',
  referer: 'https://oa.xgd.com/km/imeeting/km_imeeting_calendar/index_content_place.jsp',
  debug: process.env.OA_DEBUG === 'true'  // 环境变量控制调试输出
};

/**
 * OA 工具类 - HTTP 请求
 */
class OATools {
  constructor() {
    this.cookie = this._loadCookie();
  }

  /**
   * 从状态文件中提取 Cookie
   */
  _loadCookie() {
    try {
      if (!fs.existsSync(CONFIG.stateFile)) {
        throw new Error(`登录状态文件不存在: ${CONFIG.stateFile}`);
      }

      const stateData = JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf8'));
      const cookies = stateData.cookies || [];

      return cookies.map(c => `${c.name}=${c.value}`).join('; ');
    } catch (e) {
      throw new Error(`读取 Cookie 失败: ${e.message}`);
    }
  }

  /**
   * HTTP 请求 - 获取数据
   * @param {string} url - API URL
   * @param {Object} options - 请求选项
   * @returns {Promise<Object>} 响应数据
   */
  async http(url, options = {}) {
    const opts = {
      method: options.method || 'GET',
      headers: {
        'Cookie': this.cookie,
        'Accept': 'text/plain, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': options.referer || CONFIG.referer,
        ...options.headers
      },
      timeout: options.timeout || 30000
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeout);

    try {
      const response = await fetch(url, {
        method: opts.method,
        headers: opts.headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // 检查 HTTP 状态
      if (!response.ok) {
        return {
          status: response.status,
          ok: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          data: null
        };
      }

      // 处理空响应或非 JSON 响应
      const text = await response.text();
      if (!text || !text.trim()) {
        if (CONFIG.debug) {
          console.log('⚠️  API 返回空响应体');
        }
        return {
          status: response.status,
          ok: true,  // HTTP 状态可能是 200，但数据为空
          data: null,
          empty: true  // 添加标志表示空响应
        };
      }

      // 解析 JSON
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        return {
          status: response.status,
          ok: false,
          error: `JSON解析失败: ${e.message}`,
          data: null
        };
      }

      return {
        status: response.status,
        ok: response.ok,
        data
      };
    } catch (e) {
      clearTimeout(timeoutId);
      return {
        status: 0,
        ok: false,
        error: e.message,
        data: null
      };
    }
  }
}

/**
 * 会议室查询类
 */
class MeetingRoomQuery {
  constructor() {
    this.oaTools = new OATools();
  }

  /**
   * 获取所有页的会议室数据
   * @param {string} startDate - 开始日期
   * @param {string} endDate - 结束日期
   * @returns {Promise<Object>} { rooms: 会议室列表, targetDate: 目标日期 }
   */
  async getAllRooms(startDate, endDate) {
    // 检测是否为单天查询
    let targetDate = startDate;
    let queryStartDate = startDate;
    let queryEndDate = endDate;

    if (startDate === endDate) {
      // 单天查询：扩展范围以获取预约数据
      // OA API 在单天查询时不返回预约，需要扩展范围
      const date = new Date(startDate);
      const prevDay = new Date(date);
      prevDay.setDate(date.getDate() - 1);
      const nextDay = new Date(date);
      nextDay.setDate(date.getDate() + 1);

      queryStartDate = this._formatDate(prevDay);
      queryEndDate = this._formatDate(nextDay);
    }

    const allRooms = [];
    let page = 1;
    let hasMore = true;
    const allResponses = []; // 保存所有原始响应

    while (hasMore) {
      const url = this._buildApiUrl(page, queryStartDate, queryEndDate);
      const response = await this.oaTools.http(url);

      // 保存原始响应用于调试
      allResponses.push({
        page: page,
        url: url,
        status: response.status,
        ok: response.ok,
        data: response.data
      });

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status} - ${response.error}`);
      }

      // 检查响应数据是否为空（Linux 环境兼容性）
      if (!response.data) {
        console.error('⚠️  API 返回空数据 (可能由网络或环境问题导致)');
        if (CONFIG.debug) {
          console.log('响应状态:', response.status);
          console.log('响应 ok:', response.ok);
        }
        hasMore = false;
        continue;
      }

      const rooms = Object.values(response.data.main || {});

      // 如果没有会议室数据，停止分页
      if (rooms.length === 0) {
        hasMore = false;
      } else {
        allRooms.push(...rooms);
        // 检查是否还有更多页（添加 null 检查）
        const total = response.data.resource?.total || 0;
        if (allRooms.length >= total) {
          hasMore = false;
        } else {
          page++;
        }
      }
    }

    // 筛选目标日期的预约
    if (startDate === endDate) {
      allRooms.forEach(room => {
        if (room.list) {
          room.list = room.list.filter(booking =>
            booking.start && booking.start.includes(targetDate)
          );
        }
      });
    }

    // 输出原始 API 响应（仅在 debug 模式）
    if (CONFIG.debug) {
      console.log('\n========== 原始 API 响应 ==========');
      allResponses.forEach((resp, i) => {
        console.log(`\n--- 页面 ${resp.page} ---`);
        console.log(`URL: ${resp.url}`);
        console.log(`状态: ${resp.status} ${resp.ok ? '成功' : '失败'}`);
        console.log(`会议室数: ${resp.data ? Object.keys(resp.data.main || {}).length : 0}`);
        if (resp.data) {
          console.log(`总资源数: ${resp.data.resource?.total || 0}`);
        }

        // 显示预约数据
        const rooms = resp.data ? Object.values(resp.data.main || {}) : [];
        let hasBookings = false;

        if (!resp.data) {
          console.log('  (响应数据为空)');
        }
        rooms.forEach(room => {
          const bookings = room.list || [];
          if (bookings.length > 0) {
            hasBookings = true;
            console.log(`\n  ${room.name} (${room.floor}):`);
            bookings.slice(0, 5).forEach(b => {
              console.log(`    ${b.start} - ${b.title} (${b.statusText})`);
            });
            if (bookings.length > 5) {
              console.log(`    ... 还有 ${bookings.length - 5} 场`);
            }
          }
        });

        if (!hasBookings) {
          console.log('  (该页无预约数据)');
        }
      });
      console.log('\n========================================');
    }

    return { rooms: allRooms, targetDate };
  }

  /**
   * 构建 API URL
   * @param {number} page - 页码
   * @param {string} startDate - 开始日期
   * @param {string} endDate - 结束日期
   * @returns {string} API URL
   */
  _buildApiUrl(page, startDate, endDate) {
    const params = new URLSearchParams({
      method: 'rescalendar',
      t: Date.now(),
      pageno: page,
      selectedCategories: 'all',
      fdStart: `${startDate} 00:00`,
      fdEnd: `${endDate} 00:00`,
      s_seq: Math.random(),
      s_ajax: 'true'
    });

    const url = `${CONFIG.baseUrl}${CONFIG.apiEndpoint}&${params.toString()}`;

    // 输出原始 URL 供用户参考（仅在 debug 模式）
    if (CONFIG.debug) {
      console.log(`\n========== API 请求信息 ==========`);
      console.log(`请求 URL: ${url}`);
      console.log(`Referer: ${CONFIG.referer}`);
      console.log('========================================\n');
    }

    return url;
  }

  /**
   * 分析会议室占用情况
   * @param {Array} rooms - 会议室列表
   * @param {string} date - 日期
   * @returns {Object} 占用情况统计
   */
  analyzeOccupancy(rooms, date) {
    const stats = {
      total: rooms.length,
      occupied: 0,
      available: 0,
      byFloor: {},
      bookings: []
    };

    rooms.forEach(room => {
      const floor = room.floor || '未知';
      if (!stats.byFloor[floor]) {
        stats.byFloor[floor] = { total: 0, occupied: 0, available: 0 };
      }

      const dateBookings = (room.list || []).filter(b => b.start.includes(date));

      stats.byFloor[floor].total++;

      if (dateBookings.length > 0) {
        stats.occupied++;
        stats.byFloor[floor].occupied++;
      } else {
        stats.available++;
        stats.byFloor[floor].available++;
      }

      // 记录所有预约
      dateBookings.forEach(booking => {
        stats.bookings.push({
          room: room.name,
          floor: room.floor,
          title: booking.title,
          start: booking.start,
          end: booking.end,
          status: booking.statusText
        });
      });
    });

    return stats;
  }

  /**
   * 分析可用时间段
   * @param {Object} room - 会议室对象
   * @param {string} date - 日期
   * @returns {Array} 可用时间段列表
   */
  getAvailableSlots(room, date) {
    const bookings = (room.list || [])
      .filter(b => b.start.includes(date))
      .map(b => ({
        start: new Date(b.start),
        end: new Date(b.end)
      }))
      .sort((a, b) => a.start - b.start);

    const slots = [];
    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(`${date}T23:59:59`);

    // 如果没有预约，全天可用
    if (bookings.length === 0) {
      slots.push({
        start: '00:00',
        end: '23:59',
        duration: 1440
      });
      return slots;
    }

    let currentTime = dayStart;

    bookings.forEach(booking => {
      // 如果当前时间在预约开始之前，添加空闲时段
      if (currentTime < booking.start) {
        const duration = (booking.start - currentTime) / 1000 / 60; // 分钟
        if (duration >= 30) { // 至少30分钟才算可用时段
          slots.push({
            start: this._formatTime(currentTime),
            end: this._formatTime(booking.start),
            duration: Math.round(duration)
          });
        }
      }
      currentTime = booking.end > currentTime ? booking.end : currentTime;
    });

    // 检查最后一个预约之后是否还有空闲时段
    if (currentTime < dayEnd) {
      const duration = (dayEnd - currentTime) / 1000 / 60;
      if (duration >= 30) {
        slots.push({
          start: this._formatTime(currentTime),
          end: '23:59',
          duration: Math.round(duration)
        });
      }
    }

    return slots;
  }

  /**
   * 格式化时间
   * @param {Date} date - 日期对象
   * @returns {string} 格式化后的时间 (HH:mm)
   */
  _formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * 格式化日期
   * @param {Date} date - 日期对象
   * @returns {string} 格式化后的日期 (YYYY-MM-DD)
   */
  _formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 打印会议室列表
   * @param {Array} rooms - 会议室列表
   */
  printRooms(rooms) {
    console.log('\n========== 会议室列表 ==========');
    console.log(`总会议室数: ${rooms.length}\n`);

    // 按楼层分组
    const byFloor = {};
    rooms.forEach(room => {
      const floor = room.floor || '未知';
      if (!byFloor[floor]) byFloor[floor] = [];
      byFloor[floor].push(room);
    });

    // 按楼层排序并显示
    Object.keys(byFloor).sort((a, b) => {
      const aNum = parseInt(a.replace(/\D/g, '')) || 999;
      const bNum = parseInt(b.replace(/\D/g, '')) || 999;
      return aNum - bNum;
    }).forEach(floor => {
      console.log(`【${floor}】`);
      byFloor[floor].forEach(room => {
        console.log(`  - ${room.name}: ${room.seats}人座 ${room.detail ? '- ' + room.detail.replace(/\n/g, ' ') : ''}`);
      });
      console.log('');
    });
  }

  /**
   * 打印占用情况
   * @param {Object} stats - 占用情况统计
   * @param {string} date - 日期
   */
  printOccupancy(stats, date) {
    console.log(`\n========== ${date} 占用情况 ==========`);
    console.log(`会议室总数: ${stats.total}`);
    console.log(`已占用: ${stats.occupied}个`);
    console.log(`可用: ${stats.available}个\n`);

    // 按楼层显示
    Object.keys(stats.byFloor).sort((a, b) => {
      const aNum = parseInt(a.replace(/\D/g, '')) || 999;
      const bNum = parseInt(b.replace(/\D/g, '')) || 999;
      return aNum - bNum;
    }).forEach(floor => {
      const f = stats.byFloor[floor];
      console.log(`${floor}: ${f.available}/${f.total} 可用`);
    });

    // 显示预约列表
    if (stats.bookings.length > 0) {
      console.log('\n预约列表:');
      stats.bookings.forEach((booking, i) => {
        const startTime = booking.start.split(' ')[1];
        const endTime = booking.end.split(' ')[1];
        console.log(`  ${i + 1}. [${booking.floor}] ${booking.room} ${startTime}-${endTime} ${booking.title} (${booking.status})`);
      });
    } else {
      console.log('\n暂无预约');
    }
  }

  /**
   * 打印可用会议室
   * @param {Array} rooms - 会议室列表
   * @param {string} date - 日期
   */
  printAvailableRooms(rooms, date) {
    const available = rooms.filter(room =>
      !(room.list || []).some(b => b.start.includes(date))
    );

    console.log(`\n========== ${date} 可用会议室 ==========`);
    console.log(`可用数量: ${available.length}/${rooms.length}\n`);

    if (available.length > 0) {
      // 按楼层分组
      const byFloor = {};
      available.forEach(room => {
        const floor = room.floor || '未知';
        if (!byFloor[floor]) byFloor[floor] = [];
        byFloor[floor].push(room);
      });

      Object.keys(byFloor).sort((a, b) => {
        const aNum = parseInt(a.replace(/\D/g, '')) || 999;
        const bNum = parseInt(b.replace(/\D/g, '')) || 999;
        return aNum - bNum;
      }).forEach(floor => {
        console.log(`${floor}:`);
        byFloor[floor].forEach(room => {
          console.log(`  - ${room.name}: ${room.seats}人`);
        });
      });
    } else {
      console.log('暂无可用会议室');
    }
  }

  /**
   * 打印每个会议室的可用时间段
   * @param {Array} rooms - 会议室列表
   * @param {string} date - 日期
   */
  printAvailableSlots(rooms, date) {
    console.log(`\n========== ${date} 可用时间段 ==========\n`);

    // 按楼层分组
    const byFloor = {};
    rooms.forEach(room => {
      const floor = room.floor || '未知';
      if (!byFloor[floor]) byFloor[floor] = [];
      byFloor[floor].push(room);
    });

    Object.keys(byFloor).sort((a, b) => {
      const aNum = parseInt(a.replace(/\D/g, '')) || 999;
      const bNum = parseInt(b.replace(/\D/g, '')) || 999;
      return aNum - bNum;
    }).forEach(floor => {
      console.log(`${floor}:`);
      byFloor[floor].forEach(room => {
        const slots = this.getAvailableSlots(room, date);
        const hasBookings = (room.list || []).some(b => b.start.includes(date));
        const status = hasBookings ? '部分占用' : '全天可用';

        console.log(`  ${room.name} (${room.seats}人) [${status}]`);

        if (slots.length > 0) {
          slots.forEach(slot => {
            console.log(`    ${slot.start} - ${slot.end} (${slot.duration}分钟)`);
          });
        } else {
          console.log(`    已全天占用`);
        }
        console.log('');
      });
    });
  }

  /**
   * 导出 JSON 数据
   * @param {Array} rooms - 会议室列表
   * @param {Object} stats - 占用情况统计
   * @param {string} date - 日期
   */
  exportJson(rooms, stats, date) {
    const output = {
      date: date,
      totalRooms: rooms.length,
      occupiedCount: stats.occupied,
      availableCount: stats.available,
      rooms: rooms.map(room => {
        const dateBookings = (room.list || []).filter(b => b.start.includes(date));
        const slots = this.getAvailableSlots(room, date);

        return {
          id: room.fdId,
          name: room.name,
          floor: room.floor,
          seats: room.seats,
          devices: room.detail,
          bookings: dateBookings.map(b => ({
            title: b.title,
            start: b.start,
            end: b.end,
            status: b.statusText,
            host: b.fdHost
          })),
          availableSlots: slots,
          isFullyAvailable: slots.length === 1 && slots[0].duration >= 1430
        };
      })
    };

    const outputFile = `/tmp/meeting_rooms_${date.replace(/-/g, '')}.json`;
    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
    console.log(`\n数据已导出到: ${outputFile}`);
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const startDate = args[0] || new Date().toISOString().split('T')[0];
  const endDate = args[1] || startDate;

  console.log('========================================');
  console.log('      会议室查询 RPA 脚本');
  console.log('========================================');
  console.log(`查询日期: ${startDate} ~ ${endDate}`);
  console.log('');

  try {
    const query = new MeetingRoomQuery();

    // 获取所有会议室数据
    console.log('正在获取会议室数据...');
    const { rooms, targetDate } = await query.getAllRooms(startDate, endDate);

    // 使用目标日期（可能是扩展后的范围中的原始日期）
    const outputDate = startDate === endDate ? targetDate : startDate;

    // 打印会议室列表
    query.printRooms(rooms);

    // 分析并打印占用情况
    if (startDate === endDate) {
      // 单天查询：只显示目标日期
      const stats = query.analyzeOccupancy(rooms, outputDate);
      query.printOccupancy(stats, outputDate);
      query.printAvailableRooms(rooms, outputDate);
      query.printAvailableSlots(rooms, outputDate);

      // 导出 JSON
      query.exportJson(rooms, stats, outputDate);
    } else {
      // 多天查询：显示开始和结束日期
      const dates = [startDate, endDate];
      for (const date of dates) {
        const stats = query.analyzeOccupancy(rooms, date);
        query.printOccupancy(stats, date);
        query.printAvailableRooms(rooms, date);
      }

      // 打印可用时间段（仅第一天）
      query.printAvailableSlots(rooms, startDate);

      // 导出 JSON（仅第一天）
      const stats = query.analyzeOccupancy(rooms, startDate);
      query.exportJson(rooms, stats, startDate);
    }

    console.log('\n========================================');
    console.log('           查询完成！');
    console.log('========================================');

  } catch (error) {
    console.error('错误:', error.message);
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main();
}

module.exports = { MeetingRoomQuery, OATools };
