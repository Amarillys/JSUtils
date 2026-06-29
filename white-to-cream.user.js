// ==UserScript==
// @name         网页舒适化（白底/黑底/白字）
// @namespace    https://opencode.local/cream
// @version      1.7.4
// @description  纯白背景→Claude米色、纯黑背景→暖深灰、纯白文字→暖灰白，按原明度梯度映射保留层级差异。保留原背景透明度（半透明背景不改为不透明）。5档强度可调（油猴菜单），过滤span/遮罩层等内联元素背景。支持 Shadow DOM。修复深色系统模式下浅色页面（如天猫）html背景被误设为深色的问题：earlyStyle不再按系统颜色方案预设深色，findPageBg读取HTML时排除脚本自身干扰。
// @author       opencode
// @match        *://*/*
// @include      file:///*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
    'use strict';

    // ===== 5 档强度预设 =====
    // 数值越低 = 映射越深 = 舒适化越强
    // 白背景 base / 黑背景 base / 白字 base 对应各档
    var LEVELS = [
        { name: '1档·极轻', wb: 250, bb: 25,  tb: 245 },  // 255->250, 0->25,  255->245
        { name: '2档·轻度', wb: 245, bb: 40,  tb: 240 },  // 255->245, 0->40,  255->240
        { name: '3档·中等', wb: 240, bb: 55,  tb: 235 },  // 255->240, 0->55,  255->235
        { name: '4档·强力', wb: 235, bb: 70,  tb: 230 },  // 255->235, 0->70,  255->230
        { name: '5档·极强', wb: 230, bb: 85,  tb: 225 }   // 255->230, 0->85,  255->225
    ];
    var DEFAULT_LEVEL = 2;  // 默认 3档·中等

    function loadLevel() {
        if (typeof GM_getValue === 'function') {
            var v = GM_getValue('cream_level', DEFAULT_LEVEL);
            if (typeof v === 'number' && v >= 0 && v < LEVELS.length) return v;
        }
        return DEFAULT_LEVEL;
    }

    function saveLevel(idx) {
        if (typeof GM_setValue === 'function') GM_setValue('cream_level', idx);
    }

    var levelIdx = loadLevel();

    // ===== 动态颜色参数（随档位变化）=====
    var LIGHT_RANGE = 6;
    var DARK_RANGE = 8;
    var WHITE_LO = 246, WHITE_HI = 255;
    var WHITE_THRESH = 245;
    var BLACK_LO = 0, BLACK_HI = 30;
    var BLACK_THRESH = 30;

    // 暖色调偏移：R>G>B，保持 Claude 米色暖调
    var CREAM_DR = 0,  CREAM_DG = -2, CREAM_DB = -15;
    var OFFW_DR  = 0,  OFFW_DG  = -3, OFFW_DB  = -15;
    var DARK_DR  = 0,  DARK_DG  = -1, DARK_DB  = -4;

    // 可变配置对象：档位切换时更新这些值，所有映射函数直接读取
    var cfg = {
        CREAM_R: 0, CREAM_G: 0, CREAM_B: 0,
        OFFW_R: 0,  OFFW_G: 0,  OFFW_B: 0,
        DARK_R: 0,  DARK_G: 0,  DARK_B: 0
    };

    function applyLevel(idx) {
        var L = LEVELS[idx];
        cfg.CREAM_R = L.wb + CREAM_DR;  cfg.CREAM_G = L.wb + CREAM_DG;  cfg.CREAM_B = L.wb + CREAM_DB;
        cfg.OFFW_R  = L.tb + OFFW_DR;   cfg.OFFW_G  = L.tb + OFFW_DG;   cfg.OFFW_B  = L.tb + OFFW_DB;
        cfg.DARK_R  = L.bb + DARK_DR;   cfg.DARK_G  = L.bb + DARK_DG;   cfg.DARK_B  = L.bb + DARK_DB;
    }
    applyLevel(levelIdx);

    // ===== DEBUG 开关 =====
    var DEBUG = false;

    if (DEBUG) console.log('[cream] === INIT === level:', levelIdx, '(' + LEVELS[levelIdx].name + ')', 'readyState:', document.readyState);

    var SKIP = {
        HEAD: 1, LINK: 1, SCRIPT: 1, STYLE: 1, META: 1,
        TITLE: 1, BASE: 1, TEMPLATE: 1, NOSCRIPT: 1
    };

    // 这些元素不覆盖背景色（通常是内联文本元素，背景继承自父级）
    var SKIP_BG_TAGS = { SPAN: 1, A: 1, STRONG: 1, EM: 1, B: 1, I: 1, U: 1,
                         SMALL: 1, SUB: 1, SUP: 1, LABEL: 1, ABBR: 1, CITE: 1,
                         Q: 1, SAMP: 1, KBD: 1, VAR: 1, TIME: 1, MARK: 1 };

    // class 含这些关键词的元素不覆盖背景色（遮罩层、弹窗蒙版等）
    var SKIP_BG_CLASS = /(^|[\s_-])(mask|overlay|backdrop|selector|slider|progress)([\s_-]|$)/i;

    function shouldSkipBg(el) {
        if (SKIP_BG_TAGS[el.tagName]) {
            if (DEBUG) console.log('[cream] skipBg tag:', el.tagName, 'class:', el.className);
            return true;
        }
        var cls = el.className;
        if (cls && typeof cls === 'string' && SKIP_BG_CLASS.test(cls.toLowerCase())) {
            if (DEBUG) console.log('[cream] skipBg class:', el.tagName, 'class:', cls);
            return true;
        }
        var type = el.type;
        if (type && type === 'button') {
            if (DEBUG) console.log('[cream] skipBg type=button:', el.tagName);
            return true;
        }
        // for x
        let testid = el.dataset?.testid;
        if (testid && (testid === 'article' || testid === 'mask' || testid === 'tweet')) {
            if (DEBUG) console.log('[cream] skipBg testid:', el.tagName, 'testid:', testid);
            return true;
        }
        return false;
    }

    var RGB_RE = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/;

    function getColor(el, prop) {
        var raw;
        try { raw = getComputedStyle(el)[prop]; } catch (e) { return null; }
        if (!raw) return null;
        var m = raw.match(RGB_RE);
        if (!m) return null;
        return {
            r: parseFloat(m[1]),
            g: parseFloat(m[2]),
            b: parseFloat(m[3]),
            a: m[4] !== undefined ? parseFloat(m[4]) : 1
        };
    }

    function isNearWhite(c) {
        return !!c && c.a > 0 && c.r >= WHITE_THRESH && c.g >= WHITE_THRESH && c.b >= WHITE_THRESH;
    }

    function isNearBlack(c) {
        return !!c && c.a > 0 && c.r <= BLACK_THRESH && c.g <= BLACK_THRESH && c.b <= BLACK_THRESH;
    }

    // 通用单通道线性映射：v<=lo -> base, v>=hi -> base+range, 中间线性插值
    function mapChannel(v, base, range, lo, hi) {
        if (v <= lo) return base;
        if (v >= hi) return base + range;
        return Math.round(base + (v - lo) * range / (hi - lo));
    }

    function mappedRgb(c, br, bg, bb, range, lo, hi) {
        var r = mapChannel(c.r, br, range, lo, hi);
        var g = mapChannel(c.g, bg, range, lo, hi);
        var b = mapChannel(c.b, bb, range, lo, hi);
        // 保留原透明度：a<1 时输出 rgba，避免把半透明背景改成不透明
        if (c.a < 1) {
            return 'rgba(' + r + ',' + g + ',' + b + ',' + c.a + ')';
        }
        return 'rgb(' + r + ',' + g + ',' + b + ')';
    }

    // 保存各元素首次接触时的原始内联样式，复扫时先恢复再读取，实现自纠且不破坏站点样式
    var origData = new WeakMap();

    function treat(el) {
        if (!el || el.nodeType !== 1) return;
        if (SKIP[el.tagName]) return;

        // 首次接触：保存站点原始内联值（可能为空字符串）
        if (!origData.has(el)) {
            origData.set(el, {
                bg: el.style.getPropertyValue('background-color'),
                bgPri: el.style.getPropertyPriority('background-color'),
                color: el.style.getPropertyValue('color'),
                colorPri: el.style.getPropertyPriority('color')
            });
        }
        var orig = origData.get(el);

        // 临时恢复原始内联样式，让 getComputedStyle 反映站点真实意图
        if (orig.bg) {
            el.style.setProperty('background-color', orig.bg, orig.bgPri);
        } else {
            el.style.removeProperty('background-color');
        }

        var skipBg = shouldSkipBg(el);
        var bg = getColor(el, 'backgroundColor');
        // 不在 html 上覆盖背景色：html 背景由 syncHtmlBg() 统一控制，
        // 避免内联 !important 与 earlyStyle 冲突
        if (bg && !skipBg && el.tagName !== 'HTML') {
            if (isNearWhite(bg)) {
                var mapped = mappedRgb(bg, cfg.CREAM_R, cfg.CREAM_G, cfg.CREAM_B, LIGHT_RANGE, WHITE_LO, WHITE_HI);
                if (DEBUG) console.log('[cream] treat BG nearWhite -> cream |', el.tagName,
                    '| rgb(', bg.r,',',bg.g,',',bg.b,') ->', mapped,
                    '| class:', (el.className||'').slice(0,40),
                    '| id:', el.id);
                el.style.setProperty('background-color', mapped, 'important');
            } else if (isNearBlack(bg)) {
                var mapped = mappedRgb(bg, cfg.DARK_R, cfg.DARK_G, cfg.DARK_B, DARK_RANGE, BLACK_LO, BLACK_HI);
                if (DEBUG) console.log('[cream] treat BG nearBlack -> dark |', el.tagName,
                    '| rgb(', bg.r,',',bg.g,',',bg.b,') ->', mapped,
                    '| class:', (el.className||'').slice(0,40),
                    '| id:', el.id);
                el.style.setProperty('background-color', mapped, 'important');
            } else if (DEBUG && bg.a > 0) {
                console.log('[cream] treat BG other |', el.tagName,
                    '| rgb(', bg.r,',',bg.g,',',bg.b,',',bg.a,')',
                    '| R>=',WHITE_THRESH,'?', bg.r >= WHITE_THRESH,
                    '| G>=',WHITE_THRESH,'?', bg.g >= WHITE_THRESH,
                    '| B>=',WHITE_THRESH,'?', bg.b >= WHITE_THRESH,
                    '| R<=',BLACK_THRESH,'?', bg.r <= BLACK_THRESH,
                    '| G<=',BLACK_THRESH,'?', bg.g <= BLACK_THRESH,
                    '| B<=',BLACK_THRESH,'?', bg.b <= BLACK_THRESH);
            }
        }

        // 同理恢复并读文字色
        if (orig.color) {
            el.style.setProperty('color', orig.color, orig.colorPri);
        } else {
            el.style.removeProperty('color');
        }

        var fg = getColor(el, 'color');
        // 不在 html/body 上覆盖文字色：它们是全文档继承默认值，
        // 用 !important 覆盖会级联到所有子元素，破坏浅色区域的深色文字
        if (fg && isNearWhite(fg) && el.tagName !== 'HTML' && el.tagName !== 'BODY') {
            var mapped = mappedRgb(fg, cfg.OFFW_R, cfg.OFFW_G, cfg.OFFW_B, LIGHT_RANGE, WHITE_LO, WHITE_HI);
            if (DEBUG) console.log('[cream] treat FG nearWhite -> offw |', el.tagName,
                '| rgb(', fg.r,',',fg.g,',',fg.b,') ->', mapped,
                '| class:', (el.className||'').slice(0,40));
            el.style.setProperty('color', mapped, 'important');
        }
    }

    function walk(root) {
        if (!root) return;
        if (root.nodeType === 1) treat(root);
        var nodes = root.querySelectorAll('*');
        var count = nodes.length;
        if (DEBUG && count > 0) console.log('[cream] walk', count, 'elements under', root.tagName || root.nodeName);
        for (var i = 0; i < count; i++) {
            var el = nodes[i];
            treat(el);
            var sr = el.shadowRoot;
            if (sr) {
                walk(sr);
                observe(sr);
            }
        }
    }

    var pending = [];
    var scheduled = false;

    function flush() {
        scheduled = false;
        var list = pending;
        pending = [];
        if (DEBUG) console.log('[cream] flush', list.length, 'node(s)');
        for (var i = 0; i < list.length; i++) {
            try { walk(list[i]); } catch (e) {}
        }
    }

    function schedule(node) {
        pending.push(node);
        if (scheduled) return;
        scheduled = true;
        if (DEBUG) console.log('[cream] schedule flush rAF+timeout');
        if (window.requestAnimationFrame) {
            window.requestAnimationFrame(flush);
            window.setTimeout(flush, 300);
        } else {
            window.setTimeout(flush, 16);
        }
    }

    // 延迟复扫：新节点首次处理后，500ms 后再扫一次，修正 CSS 未就绪导致的误判
    var delayedPending = [];
    var delayedTimer = null;

    function scheduleDelayed(node) {
        delayedPending.push(node);
        if (delayedTimer) return;
        if (DEBUG) console.log('[cream] scheduleDelayed 500ms');
        delayedTimer = window.setTimeout(function () {
            delayedTimer = null;
            var list = delayedPending;
            delayedPending = [];
            if (DEBUG) console.log('[cream] delayed flush', list.length, 'nodes');
            for (var i = 0; i < list.length; i++) {
                try { walk(list[i]); } catch (e) {}
            }
            syncHtmlBg();
        }, 500);
    }

    function observe(root) {
        if (!window.MutationObserver) return;
        if (root.__creamObs) return;
        root.__creamObs = true;
        if (DEBUG) console.log('[cream] observe start on', root.tagName || root.nodeName);
        var obs = new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var added = mutations[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                    var n = added[j];
                    if (n.nodeType === 1) {
                        if (DEBUG) console.log('[cream] observe new node:', n.tagName, 'class:', (n.className||'').slice(0,40));
                        schedule(n);
                        scheduleDelayed(n);
                    }
                }
            }
        });
        obs.observe(root, { childList: true, subtree: true });
    }

    // 找到页面真实背景色：从 body 往下找第一个不透明背景，或回溯到 html 自身
    // 当 body 及其直接子元素都透明时，继续检查孙级元素（常见于深色 html 框架 + 白色内容卡片布局）
    function findPageBg() {
        var candidates = [];
        if (document.body) {
            candidates.push(document.body);
            var firstChildren = document.body.children;
            for (var i = 0; i < firstChildren.length && i < 20; i++) {
                if (firstChildren[i].nodeType === 1) {
                    candidates.push(firstChildren[i]);
                    // 孙级元素：body > child > grandchild
                    var grandchildren = firstChildren[i].children;
                    for (var gi = 0; gi < grandchildren.length && gi < 10; gi++) {
                        if (grandchildren[gi].nodeType === 1) candidates.push(grandchildren[gi]);
                    }
                }
            }
        }
        candidates.push(document.documentElement);
        for (var j = 0; j < candidates.length; j++) {
            var el = candidates[j];
            // 读取 HTML 背景前临时禁用 earlyStyle，避免把脚本自身设置的 html 背景误判为页面真实背景
            var earlySheet = (el === document.documentElement && earlyStyle.sheet) ? earlyStyle.sheet : null;
            if (earlySheet) earlySheet.disabled = true;
            var c = getColor(el, 'backgroundColor');
            if (earlySheet) earlySheet.disabled = false;
            if (c && c.a > 0) {
                if (DEBUG) console.log('[cream] findPageBg found | tag:', el.tagName,
                    '| rgb(', c.r,',',c.g,',',c.b,',',c.a,')',
                    '| nearWhite:', isNearWhite(c), '| nearBlack:', isNearBlack(c),
                    '| step:', j, '/', candidates.length);
                return c;
            }
            if (DEBUG) console.log('[cream] findPageBg skip transparent | tag:', el.tagName,
                '| step:', j, '/', candidates.length);
        }
        if (DEBUG) console.log('[cream] findPageBg all transparent, returning null');
        return null;
    }

    function syncHtmlBg() {
        var c = findPageBg();
        if (!c) {
            if (DEBUG) console.log('[cream] syncHtmlBg no page bg found, abort');
            return;  // 全透明，保持默认
        }
        var val;
        if (isNearBlack(c)) {
            val = 'rgb(' + cfg.DARK_R + ',' + cfg.DARK_G + ',' + cfg.DARK_B + ')';
            if (DEBUG) console.log('[cream] syncHtmlBg nearBlack ->', val);
        } else if (isNearWhite(c)) {
            val = 'rgb(' + cfg.CREAM_R + ',' + cfg.CREAM_G + ',' + cfg.CREAM_B + ')';
            if (DEBUG) console.log('[cream] syncHtmlBg nearWhite ->', val);
        } else {
            // 彩/灰色背景：html 用同色，保证透明区域不透出异色
            val = 'rgb(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ')';
            if (DEBUG) console.log('[cream] syncHtmlBg colored ->', val, '(original:', c.r, c.g, c.b, ')');
        }
        earlyStyle.textContent = 'html{background-color:' + val + ' !important}';
    }

    function onReady() {
        if (DEBUG) console.log('[cream] === onReady === level:', levelIdx, '(', LEVELS[levelIdx].name, ')', 'Cfg:', cfg);
        walk(document.documentElement);
        syncHtmlBg();
        observe(document.documentElement);
        window.addEventListener('load', function () {
            if (DEBUG) console.log('[cream] === window.load ===');
            walk(document.documentElement); syncHtmlBg();
        });
        window.setTimeout(function () {
            if (DEBUG) console.log('[cream] === timeout 1.5s ===');
            walk(document.documentElement); syncHtmlBg();
        }, 1500);
        window.setTimeout(function () {
            if (DEBUG) console.log('[cream] === timeout 4s ===');
            walk(document.documentElement); syncHtmlBg();
        }, 4000);
    }

    // ===== 档位切换：更新参数 + 重扫全页 + 刷新 html 背景 =====
    function setLevel(idx) {
        if (DEBUG) console.log('[cream] === setLevel', idx, '(' + LEVELS[idx].name + ')', '===');
        levelIdx = idx;
        saveLevel(idx);
        applyLevel(idx);
        earlyStyle.textContent = buildEarlyCss();
        // 清空 WeakMap 快照，让所有元素按新参数重新映射
        origData = new WeakMap();
        walk(document.documentElement);
        syncHtmlBg();
    }

    // ===== 油猴菜单：注册各档位 =====
    // 注意：菜单标签在注册时固定，切换后不会自动刷新标记，但选择已持久化
    if (typeof GM_registerMenuCommand === 'function') {
        for (var i = 0; i < LEVELS.length; i++) {
            (function (idx) {
                var label = (idx === levelIdx ? '● ' : '○ ') + LEVELS[idx].name;
                GM_registerMenuCommand(label, function () { setLevel(idx); });
            })(i);
        }
    }

    var earlyStyle = document.createElement('style');
    // 早期默认：统一用米色防白闪（不按系统颜色方案区分，因为页面背景与系统偏好无关）
    // syncHtmlBg 会随后按页面真实背景覆盖；深色页面会有短暂米色闪，但很快被修正
    function buildEarlyCss() {
        return 'html{background-color:rgb(' + cfg.CREAM_R + ',' + cfg.CREAM_G + ',' + cfg.CREAM_B + ') !important}';
    }
    earlyStyle.textContent = buildEarlyCss();
    (document.head || document.documentElement).appendChild(earlyStyle);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady, { once: true });
    } else {
        onReady();
    }
})();
