/**
 * Web Extractor - 网页数据提取工具库
 *
 * 用于在浏览器环境中执行网页提取和交互操作
 * 提供 Node.js 端工具和浏览器端工具
 */

const fs = require('fs');

/**
 * 生成可在浏览器中执行的 JavaScript 代码字符串
 * 这段代码会被注入到浏览器页面中，提供 WebExtractor 全局对象
 */
function generateClientCode() {
  return String.raw`
    (function() {
      'use strict';

      window.WebExtractor = {
        version: '1.0.0',

        /**
         * 表格提取工具
         */
        TableExtractor: {
          /**
           * 提取表格为结构化数据
           * @param {string} tableSelector - 表格选择器
           * @param {Object} options - 选项
           * @param {number} options.headerRow - 表头行索引，默认0
           * @param {boolean} options.skipHeader - 是否跳过表头，默认true
           * @param {Function} options.filterFn - 行过滤函数
           * @param {Function} options.cellTransform - 单元格转换函数
           * @returns {Object} { success, header, data, rowCount, error }
           */
          extractTable(tableSelector, options) {
            const opts = options || {};
            const headerRow = opts.headerRow !== undefined ? opts.headerRow : 0;
            const skipHeader = opts.skipHeader !== undefined ? opts.skipHeader : true;

            const table = document.querySelector(tableSelector);
            if (!table) {
              return { success: false, error: 'Table not found: ' + tableSelector };
            }

            const rows = Array.from(table.querySelectorAll('tr'));
            if (rows.length === 0) {
              return { success: false, error: 'No rows found in table' };
            }

            // 提取表头
            const header = [];
            const headerRowEl = rows[headerRow];
            if (headerRowEl) {
              const headerCells = Array.from(headerRowEl.querySelectorAll('th, td'));
              headerCells.forEach(cell => {
                header.push(cell.textContent.trim());
              });
            }

            // 提取数据行
            const dataRows = skipHeader ? rows.slice(headerRow + 1) : rows;
            const data = dataRows.map(row => {
              const cells = Array.from(row.querySelectorAll('td, th'));
              return cells.map(cell => {
                let text = cell.textContent.trim();
                // 应用转换函数（如果有）
                if (opts.cellTransform && typeof opts.cellTransform === 'function') {
                  text = opts.cellTransform(text, cell);
                }
                return text;
              });
            });

            // 应用行过滤（如果有）
            let filteredData = data;
            if (opts.filterFn && typeof opts.filterFn === 'function') {
              filteredData = data.filter(opts.filterFn);
            }

            const result = {
              success: true,
              header: header,
              data: filteredData,
              rowCount: filteredData.length
            };

            // 如果需要 Markdown 格式
            if (opts.format === 'markdown' || opts.toMarkdown) {
              result.markdown = this.toMarkdown(header, filteredData, opts);
            }

            return result;
          },

          /**
           * 将表格数据转换为 Markdown 格式
           * @param {Array} header - 表头数组
           * @param {Array} data - 数据行数组
           * @param {Object} options - 选项
           * @returns {string} Markdown 格式的表格
           */
          toMarkdown(header, data, options = {}) {
            const opts = options || {};
            const lines = [];

            if (opts.title) {
              lines.push('## ' + opts.title);
              lines.push('');
            }

            if (header && header.length > 0) {
              // 表头
              lines.push('| ' + header.join(' | ') + ' |');
              // 分隔线
              lines.push('| ' + header.map(() => '---').join(' | ') + ' |');
            }

            // 数据行
            data.forEach(row => {
              // 清理单元格中的换行符和多余空格
              const cleanRow = row.map(cell => {
                return String(cell).replace(/[\\n\\r]+/g, ' ').replace(/\\s+/g, ' ').trim();
              });
              lines.push('| ' + cleanRow.join(' | ') + ' |');
            });

            return lines.join('\n');
          },

          /**
           * 根据表头文本查找表格
           * @param {string} headerText - 表头文本（部分匹配）
           * @returns {Object|null} 返回表格的 outerHTML 或 null
           */
          findTableByHeader(headerText) {
            const tables = document.querySelectorAll('table');
            for (const table of tables) {
              const headers = table.querySelectorAll('th, td');
              for (const header of headers) {
                if (header.textContent.includes(headerText)) {
                  return table.outerHTML;
                }
              }
            }
            return null;
          },

          /**
           * 提取符合条件的行
           * @param {string} tableSelector - 表格选择器
           * @param {Function} filterFn - 过滤函数
           * @returns {Object} { success, rows, count }
           */
          extractTableRows(tableSelector, filterFn) {
            const table = document.querySelector(tableSelector);
            if (!table) {
              return { success: false, error: 'Table not found' };
            }

            const allRows = Array.from(table.querySelectorAll('tr'));
            const filteredRows = allRows.filter(filterFn);

            return {
              success: true,
              rows: filteredRows.map(row => row.textContent.trim()),
              count: filteredRows.length
            };
          }
        },

        /**
         * 元素查找工具
         */
        ElementFinder: {
          /**
           * 查找按钮
           * @param {string} text - 按钮文本
           * @param {Object} options - 选项
           * @returns {Object|null} 按钮元素信息
           */
          findButton(text, options) {
            const opts = options || {};
            const selectors = opts.selectors || ['button', '[role="button"]', 'input[type="button"]', 'input[type="submit"]'];

            for (const selector of selectors) {
              const buttons = document.querySelectorAll(selector);
              for (const btn of buttons) {
                const btnText = btn.textContent.trim();
                const btnValue = btn.value || '';
                if (btnText.includes(text) || btnValue.includes(text)) {
                  // 检查是否可见
                  if (btn.offsetParent !== null) {
                    return this._getElementInfo(btn);
                  }
                }
              }
            }
            return null;
          },

          /**
           * 查找输入框
           * @param {string} labelText - 关联的标签文本
           * @returns {Object|null} 输入框元素信息
           */
          findInput(labelText) {
            const labels = document.querySelectorAll('label');
            for (const label of labels) {
              if (label.textContent.includes(labelText)) {
                // 通过 label 的 for 属性查找
                if (label.htmlFor) {
                  const input = document.querySelector('#' + label.htmlFor);
                  if (input) {
                    return this._getElementInfo(input);
                  }
                }
                // 在 label 的父元素中查找
                const parent = label.parentElement;
                if (parent) {
                  const input = parent.querySelector('input, textarea');
                  if (input) {
                    return this._getElementInfo(input);
                  }
                }
              }
            }
            return null;
          },

          /**
           * 查找链接
           * @param {string} text - 链接文本
           * @param {string} href - 链接地址（可选）
           * @returns {Object|null} 链接元素信息
           */
          findLink(text, href) {
            const links = document.querySelectorAll('a');
            for (const link of links) {
              const linkText = link.textContent.trim();
              const linkHref = link.getAttribute('href') || '';
              const matchText = !text || linkText.includes(text);
              const matchHref = !href || linkHref.includes(href);
              if (matchText && matchHref) {
                return this._getElementInfo(link);
              }
            }
            return null;
          },

          /**
           * 查找下拉框
           * @param {string} labelText - 关联的标签文本
           * @returns {Object|null} 下拉框元素信息
           */
          findSelect(labelText) {
            const labels = document.querySelectorAll('label');
            for (const label of labels) {
              if (label.textContent.includes(labelText)) {
                if (label.htmlFor) {
                  const select = document.querySelector('#' + label.htmlFor + '[role="select"], #' + label.htmlFor + ' select');
                  if (select) {
                    return this._getElementInfo(select);
                  }
                }
                const parent = label.parentElement;
                if (parent) {
                  const select = parent.querySelector('select');
                  if (select) {
                    return this._getElementInfo(select);
                  }
                }
              }
            }
            return null;
          },

          /**
           * 检查元素是否存在且可见
           * @param {string} selector - CSS 选择器
           * @returns {boolean}
           */
          exists(selector) {
            const el = document.querySelector(selector);
            return el !== null && el.offsetParent !== null;
          },

          /**
           * 获取元素信息
           * @private
           */
          _getElementInfo(el) {
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            return {
              tagName: el.tagName,
              id: el.id,
              className: el.className,
              text: el.textContent.trim(),
              value: el.value || '',
              href: el.getAttribute('href') || '',
              visible: el.offsetParent !== null,
              rect: {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height
              }
            };
          }
        },

        /**
         * 元素交互工具
         */
        ElementInteractor: {
          /**
           * 点击按钮
           * @param {string} text - 按钮文本
           * @returns {Object} { success, element }
           */
          clickButton(text) {
            const finder = window.WebExtractor.ElementFinder;
            const btnInfo = finder.findButton(text);

            if (!btnInfo) {
              return { success: false, error: 'Button not found: ' + text };
            }

            const btn = document.querySelector('#' + btnInfo.id) ||
                       document.querySelector(btnInfo.tagName + '[class*="' + btnInfo.className + '"]');

            if (btn) {
              btn.click();
              return { success: true, element: btnInfo };
            }

            return { success: false, error: 'Button found but not clickable' };
          },

          /**
           * 填充输入框
           * @param {string} labelText - 标签文本
           * @param {string} value - 要填充的值
           * @returns {Object} { success, element }
           */
          fillInput(labelText, value) {
            const finder = window.WebExtractor.ElementFinder;
            const inputInfo = finder.findInput(labelText);

            if (!inputInfo) {
              return { success: false, error: 'Input not found: ' + labelText };
            }

            const input = document.querySelector('#' + inputInfo.id) ||
                         document.querySelector(inputInfo.tagName.toLowerCase() + '[class*="' + inputInfo.className + '"]');

            if (input) {
              input.value = value;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              return { success: true, element: inputInfo };
            }

            return { success: false, error: 'Input found but not fillable' };
          },

          /**
           * 选择下拉选项
           * @param {string} selectSelector - 下拉框选择器
           * @param {string} value - 要选择的值
           * @returns {Object} { success }
           */
          selectOption(selectSelector, value) {
            const select = document.querySelector(selectSelector);
            if (!select) {
              return { success: false, error: 'Select not found' };
            }

            const options = Array.from(select.options);
            const targetOption = options.find(opt => opt.value === value || opt.textContent.includes(value));

            if (targetOption) {
              select.selectedIndex = targetOption.index;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              return { success: true, selectedValue: targetOption.value };
            }

            return { success: false, error: 'Option not found: ' + value };
          },

          /**
           * 勾选复选框
           * @param {string} labelText - 标签文本
           * @param {boolean} checked - 是否勾选
           * @returns {Object} { success }
           */
          checkCheckbox(labelText, checked) {
            const finder = window.WebExtractor.ElementFinder;

            // 查找复选框
            const labels = document.querySelectorAll('label');
            for (const label of labels) {
              if (label.textContent.includes(labelText)) {
                let checkbox = null;
                if (label.htmlFor) {
                  checkbox = document.querySelector('#' + label.htmlFor + '[type="checkbox"]');
                }
                if (!checkbox) {
                  checkbox = label.querySelector('input[type="checkbox"]') ||
                            label.parentElement.querySelector('input[type="checkbox"]');
                }

                if (checkbox) {
                  checkbox.checked = checked;
                  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                  return { success: true, checked: checkbox.checked };
                }
              }
            }

            return { success: false, error: 'Checkbox not found: ' + labelText };
          }
        },

        /**
         * 调试辅助工具
         */
        DebugHelper: {
          /**
           * 获取元素详细信息
           * @param {string} selector - CSS 选择器
           * @returns {Object} 元素信息
           */
          getElementInfo(selector) {
            const el = document.querySelector(selector);
            if (!el) {
              return { error: 'Element not found: ' + selector };
            }

            const finder = window.WebExtractor.ElementFinder;
            return finder._getElementInfo(el);
          },

          /**
           * 获取页面上所有表格的概览
           * @returns {Array} 表格列表
           */
          getAllTables() {
            const tables = document.querySelectorAll('table');
            return Array.from(tables).map((table, index) => {
              const rows = table.querySelectorAll('tr');
              const hasHeader = !!table.querySelector('th');
              const preview = table.textContent.substring(0, 100).replace(/\\s+/g, ' ');

              return {
                index: index,
                rowCount: rows.length,
                hasHeader: hasHeader,
                preview: preview.trim(),
                selector: 'table:nth-of-type(' + (index + 1) + ')'
              };
            });
          },

          /**
           * 获取所有按钮的概览
           * @returns {Array} 按钮列表
           */
          getAllButtons() {
            const buttons = document.querySelectorAll('button, [role="button"]');
            return Array.from(buttons).map((btn, index) => {
              return {
                index: index,
                text: btn.textContent.trim(),
                id: btn.id,
                className: btn.className,
                visible: btn.offsetParent !== null
              };
            });
          },

          /**
           * 获取所有输入框的概览
           * @returns {Array} 输入框列表
           */
          getAllInputs() {
            const inputs = document.querySelectorAll('input, textarea');
            return Array.from(inputs).map((input, index) => {
              return {
                index: index,
                type: input.type || 'textarea',
                id: input.id,
                name: input.name,
                className: input.className,
                placeholder: input.placeholder || '',
                value: input.value || '',
                visible: input.offsetParent !== null
              };
            });
          },

          /**
           * 获取页面结构概览
           * @returns {Object} 页面信息
           */
          getPageOverview() {
            return {
              url: window.location.href,
              title: document.title,
              tables: this.getAllTables().length,
              buttons: document.querySelectorAll('button, [role="button"]').length,
              inputs: document.querySelectorAll('input, textarea').length,
              links: document.querySelectorAll('a').length,
              forms: document.querySelectorAll('form').length
            };
          }
        }
      };

      // 返回初始化成功
      return { success: true, version: window.WebExtractor.version };
    })();
  `;
}

/**
 * 断点函数 - 在指定位置暂停，保持浏览器打开
 * 适用于 AI 脚本录制时的人工确认和调试
 *
 * @param {Object} browser - Browser 实例
 * @param {string} label - 断点标签
 * @param {Object} info - 附加信息（可选）
 */
function breakpoint(browser, label, info) {
  const infoData = info || {};

  console.log('');
  console.log('==========================');
  console.log('📍 断点: ' + label);
  console.log('🕐 ' + new Date().toISOString());
  console.log('🌐 Session: ' + (browser ? browser.session : 'unknown'));

  if (Object.keys(infoData).length > 0) {
    console.log('');
    console.log('📋 附加信息:');
    console.log(JSON.stringify(infoData, null, 2));
  }

  console.log('');
  console.log('💡 浏览器保持打开，可手动调试：');
  if (browser && browser.session) {
    console.log('   npx agent-browser --session ' + browser.session + ' snapshot');
    console.log('   npx agent-browser --session ' + browser.session + ' eval "WebExtractor.DebugHelper.getAllTables()"');
    console.log('   npx agent-browser --session ' + browser.session + ' screenshot /tmp/debug.png');
    console.log('');
    console.log('   关闭浏览器:');
    console.log('   npx agent-browser --session ' + browser.session + ' close');
  }
  console.log('==========================');
  console.log('');

  // 退出进程，浏览器保持打开
  process.exit(0);
}

/**
 * 生成断点脚本 - 在浏览器中执行，输出断点信息
 *
 * @param {string} label - 断点标签
 * @param {Object} info - 附加信息
 * @returns {string} JavaScript 代码
 */
function generateBreakpointCode(label, info) {
  const infoJson = JSON.stringify(info || {});
  return `
    (function() {
      console.log('');
      console.log('==========================');
      console.log('📍 浏览器端断点: ${label}');
      console.log('🕐 ' + new Date().toISOString());
      console.log('🌐 URL: ' + window.location.href);
      console.log('');
      console.log('📋 附加信息:');
      console.log(JSON.stringify(${infoJson}, null, 2));
      console.log('==========================');
      console.log('');
      return { success: true, label: '${label}', timestamp: new Date().toISOString() };
    })();
  `;
}

module.exports = {
  generateClientCode,
  breakpoint,
  generateBreakpointCode
};
