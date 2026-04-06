export default function(
    RUNTIME,
    KeyboardUtils,
    Mode,
    createElementWithContent,
    getBrowserName,
    htmlEncode,
    initL10n,
    reportIssue,
    setSanitizedContent,
    showBanner,
) {
    var mappingsEditor = null;
    function createMappingEditor(elmId) {
        var _ace = ace.edit(elmId);
        _ace.mode = "normal";

        var self = new Mode("mappingsEditor");

        self.container = _ace.container;
        self.setValue = function(v, cursorPos) {
            _ace.setValue(v, cursorPos);
        };
        self.getValue = function() {
            return _ace.getValue();
        };

        self.addEventListener('keydown', function(event) {
            event.sk_suppressed = true;
            if (Mode.isSpecialKeyOf("<Esc>", event.sk_keyName)
                && _ace.mode === 'normal' // vim in normal mode
                && (_ace.state.cm.state.vim.status === null || _ace.state.cm.state.vim.status === "") // and no pending normal operation
            ) {
                document.activeElement.blur();
                self.exit();
            }
        });
        document.querySelector('#mappings textarea').onfocus = function() {
            setTimeout(function() {
                self.enter(0, true);
            }, 10);
        };

        _ace.setTheme("ace/theme/chrome");
        ace.config.loadModule('ace/ext/language_tools', function (mod) {
            ace.config.loadModule('ace/autocomplete', function (mod) {
                mod.Autocomplete.startCommand.bindKey = "Tab";
                mod.Autocomplete.prototype.commands['Space'] = mod.Autocomplete.prototype.commands['Tab'];
                mod.Autocomplete.prototype.commands['Tab'] = mod.Autocomplete.prototype.commands['Down'];
                mod.Autocomplete.prototype.commands['Shift-Tab'] = mod.Autocomplete.prototype.commands['Up'];
            });
            _ace.setOptions({
                enableBasicAutocompletion: true,
                enableLiveAutocompletion: false,
                enableSnippets: false
            });
        });
        _ace.setKeyboardHandler('ace/keyboard/vim', function() {
            var cm = _ace.state.cm;
            cm.on('vim-mode-change', function(data) {
                _ace.mode = data.mode;
            });
            cm.constructor.Vim.defineEx("write", "w", function(cm, input) {
                saveSettings();
            });
            cm.constructor.Vim.defineEx("quit", "q", function(cm, input) {
                window.close();
            });
        });
        _ace.getSession().setMode("ace/mode/javascript");
        _ace.$blockScrolling = Infinity;

        return self;
    }

    if (getBrowserName() === "Firefox") {
        document.querySelector("#localPathForSettings").style.display = "";
        document.querySelector("#proxySettings").style.display = "none";
    } else if (getBrowserName().startsWith("Safari")) {
        document.querySelector("#localPathHelpForFile").remove();
        document.querySelector("#proxySettings").style.display = "none";
        document.querySelector("#donationDiv").style.display = "none";
    }
    var proxyModeSelect = document.querySelector("#proxyMode>select");
    var proxyGroup = document.getElementById("proxyMode").parentElement;
    var addProxyPair = document.getElementById('addProxyPair');
    addProxyPair.onclick = function () {
        _updateProxy({
            number: document.querySelectorAll('div.proxyPair').length,
            proxy: "SOCKS5 127.0.0.1:1080"
        });
    };

    function renderAutoproxyHosts(rs, divProxyPair, number) {
        var desc = "For below hosts, above proxy will be used, click ❌ to remove one.";
        if (rs.proxyMode === "bypass") {
            desc = "For below hosts, <b>NO</b> proxy will be used, click ❌ to remove one.";
        }
        setSanitizedContent(divProxyPair.querySelector('.autoproxy_hosts>h3'), desc);

        var autoproxyHostsInput = divProxyPair.querySelector(".autoproxy_hosts>input");

        var ih = autoproxyHostsInput.value;
        autoproxyHostsInput.value = "";
        var autoproxy_hosts = rs.autoproxy_hosts[number].sort().map(function(h) {
            return `<div class='aphost'><span class='remove'>❌</span><span class="${h === ih ? 'highlight' : ''}">${h}</span></div>`;
        }).join("");
        setSanitizedContent(divProxyPair.querySelector('.autoproxy_hosts>div'), autoproxy_hosts);

        var autoproxyHostsDiv = divProxyPair.querySelector(".autoproxy_hosts");
        autoproxyHostsDiv.querySelectorAll('div.aphost>span.remove').forEach(function(ph) {
            ph.onclick = function() {
                var elm = this.closest('div.aphost');
                RUNTIME('updateProxy', {
                    number: number,
                    host: elm.querySelector("span:nth-child(2)").innerText,
                    operation: 'remove'
                }, function() {
                    elm.remove();
                });
            };
        });

        function addAutoProxyHost() {
            _updateProxy({
                number: number,
                host: autoproxyHostsInput.value,
                operation: 'add'
            });
        }

        autoproxyHostsInput.onkeyup = function(e) {
            if (e.keyCode === 13) {
                addAutoProxyHost();
            }
        };

        divProxyPair.querySelector('.autoproxy_hosts>button').onclick = addAutoProxyHost;

        divProxyPair.querySelector('.deleteProxyPair').onclick = function() {
            _updateProxy({
                number: number,
                operation: "deleteProxyPair"
            });
        };
    }

    function renderProxyPair(proxy, number) {
        var divProxyPair = document.querySelector(`div.proxyPair[number='${number}']`);
        if (divProxyPair === null) {
            divProxyPair = createElementWithContent('div',
                document.getElementById("templateProxyPair").innerHTML.trim(), {"class": "proxyPair", "number": number});
            proxyGroup.insertBefore(divProxyPair, addProxyPair);
        }

        var proxySelect = divProxyPair.querySelector(".proxy>select");
        var proxyInput = divProxyPair.querySelector(".proxy>input");

        function __updateProxy(data) {
            let v = proxyInput.value.replace(/\W+([0-9]+)$/, ":$1");
            _updateProxy({
                number: number,
                proxy: proxySelect.value + " " + v
            });
        }

        proxySelect.onchange = __updateProxy;
        proxyInput.onblur = __updateProxy;

        var p = proxy.split(/\s+/);
        if (p.length > 0) {
            proxySelect.value = p[0];
            proxyInput.value = p[1];
        } else {
            proxySelect.value = "PROXY";
        }
        return divProxyPair;
    }

    function renderProxySettings(rs) {
        proxyModeSelect.value = rs.proxyMode;
        proxyModeSelect.onchange = function() {
            _updateProxy({
                mode: this.value
            });
        };
        document.querySelectorAll('#proxyMode span[mode]').forEach(function(span) {
            span.hide();
        });
        document.querySelector(`#proxyMode span[mode=${rs.proxyMode}]`).show();
        if (rs.proxyMode === "always" || rs.proxyMode === "byhost" || rs.proxyMode === "bypass") {

            document.querySelectorAll('div.proxyPair').remove();
            if (rs.proxyMode === "always") {
                var pp = renderProxyPair(rs.proxy[0], 0);
                pp.querySelector('.autoproxy_hosts').hide();
                addProxyPair.hide();
            } else {
                rs.proxy.forEach(function(proxy, number) {
                    var pp = renderProxyPair(proxy, number);
                    pp.querySelector('.autoproxy_hosts').show();
                    renderAutoproxyHosts(rs, pp, number);
                });
                addProxyPair.show();
            }
            var deleteProxyPairs = document.querySelectorAll('div.deleteProxyPair');
            if (deleteProxyPairs.length > 1) {
                deleteProxyPairs.show();
            } else {
                deleteProxyPairs.hide();
            }
        }
    }

    function _updateProxy(data) {
        RUNTIME('updateProxy', data, function(res) {
            renderProxySettings(res);
        });
    }

    const basicSettingsDiv = document.getElementById("basicSettings");
    const basicMappingsDiv = document.getElementById("basicMappings");
    const advancedSettingDiv = document.getElementById("advancedSetting");
    const advancedToggler = document.getElementById("advancedToggler");
    function showAdvanced(flag) {
        if (flag) {
            basicSettingsDiv.hide();
            advancedSettingDiv.show();
            advancedToggler.setAttribute('checked', 'checked');
        } else {
            basicSettingsDiv.show();
            advancedSettingDiv.hide();
            advancedToggler.removeAttribute('checked');
        }
    }

    var localPathSaved = "";
    var localPathInput = document.getElementById("localPath");
    var sample = document.getElementById("sample").innerHTML;
    function renderSettings(rs) {
        if (rs.isMV3) {
            document.getElementById("advancedTip").innerText = "First turn on 'Developer mode' in chrome://extensions/, then turn on 'Allow User Scripts' in KitingKeys extension details, then toggle the 'Advanced mode' flag here.";
            advancedToggler.disabled = !rs.isUserScriptsAvailable;
            showAdvanced(rs.isUserScriptsAvailable && rs.showAdvanced);
        } else {
            showAdvanced(rs.showAdvanced);
        }
        if (rs.localPath) {
            localPathInput.value = rs.localPath;
            localPathSaved = rs.localPath;
        }
        var h = window.innerHeight / 2;
        mappingsEditor.container.style.height = h + "px";
        if (rs.snippets && rs.snippets.length) {
            mappingsEditor.setValue(rs.snippets, -1);
        } else {
            mappingsEditor.setValue(sample, -1);
        }

        renderProxySettings(rs);
    }


    advancedToggler.onclick = function() {
        var newFlag = this.checked;
        RUNTIME('updateSettings', {
            settings: {
                showAdvanced: newFlag
            }
        }, (resp) => {
            if (resp.error) {
                showBanner(resp.error, 3000);
            } else {
                showAdvanced(newFlag);
            }
        });
    };
    document.getElementById('resetSettings').onclick = function() {
        if (this.innerText === "Reset") {
            this.innerText = "WARNING! This will clear all your settings. Click this again to continue.";
        } else {
            RUNTIME("resetSettings", null, function(response) {
                renderSettings(response.settings);
                renderKeyMappings(response.settings);
                showBanner('Settings reset', 1000);
            });
        }
    };

    document.querySelector('.infoPointer').onclick = function() {
        var f = document.getElementById(this.getAttribute("for"));
        if (f.style.display === "none") {
            f.style.display = "";
        } else {
            f.style.display = "none";
        }
    };

    function getURIPath(fn) {
        if (fn.length && !/^\w+:\/\/\w+/i.test(fn) && fn.indexOf('file:///') === -1) {
            fn = fn.replace(/\\/g, '/');
            if (fn[0] === '/') {
                fn = fn.substr(1);
            }
            fn = "file:///" + fn;
        }
        return fn;
    }
    function saveSettings() {
        var settingsCode = mappingsEditor.getValue();
        var localPath = getURIPath(localPathInput.value.trim());
        if (localPath.length && localPath !== localPathSaved) {
            RUNTIME('loadSettingsFromUrl', {
                url: localPath
            }, function(res) {
                showBanner(res.status + ' to load settings from ' + localPath, 5000);
                renderKeyMappings(res);
                if (res.snippets && res.snippets.length) {
                    localPathSaved = localPath;
                    mappingsEditor.setValue(res.snippets, -1);
                } else if (settingsCode === "") {
                    mappingsEditor.setValue(sample, -1);
                }
            });
        } else {
            RUNTIME('updateSettings', {
                settings: {
                    snippets: settingsCode,
                    localPath: getURIPath(localPathInput.value)
                }
            });

            showBanner('Settings saved', 1000);
        }
    }
    document.getElementById('save_button').onclick = saveSettings;

    var basicMappings = ['d', 'R', 'f', 'E', 'e', 'x', 'gg', 'j', '/', 'n', 'r', 'k', 'S', 'C', 'on', 'G', 'v', 'i', ';e', 'og', 'g0', 't', '<Ctrl-6>', 'yy', 'g$', 'D', 'ob', 'X', 'sg', 'cf', 'yv', 'yt', 'N', 'l', 'cc', '$', 'yf', 'w', '0', 'yg', 'ow', 'cs', 'b', 'om', 'ya', 'h', 'gU', 'W', 'B', 'F', ';j'];


    document.addEventListener("surfingkeys:defaultSettingsLoaded", function(evt) {
        const { normal } = evt.detail;
        basicMappings = basicMappings.map(function(w, i) {
            const binding = normal.mappings.find(KeyboardUtils.encodeKeystroke(w));
            if (binding) {
                return {
                    origin: w,
                    annotation: binding.meta.annotation
                };
            } else {
                return null;
            }
        }).filter((m) => m !== null);;
    });

    function renderSearchAlias(frontCommand, disabledSearchAliases) {
        new Promise((r, j) => {
            const getSearchAliases = () => {
                frontCommand({
                    action: 'getSearchAliases'
                }, function(response) {
                    if (Object.keys(response.aliases).length > 0) {
                        r(response.aliases);
                    } else {
                        setTimeout(getSearchAliases, 300);
                    }
                });
            };
            getSearchAliases();
        }).then((aliases) => {
            const allAliases = {};
            for (const key in aliases) {
                let prompt = aliases[key].prompt;
                if (!prompt.startsWith("<img src=")) {
                    prompt = prompt.replace(/<span class='separator'>.*/, '');
                }
                allAliases[key] = { prompt, checked: "checked" };
            }
            for (const key in disabledSearchAliases) {
                allAliases[key] = { prompt: disabledSearchAliases[key], checked: "" };
            }
            for (const key in allAliases) {
                const { prompt, checked } = allAliases[key];
                const elm = createElementWithContent("div", `<div class='remove'><input type="checkbox" ${checked} /></div><span class='prompt'>${prompt}</span>`);
                document.querySelector("#searchAliases").appendChild(elm);

                elm.querySelector("input").onchange = () => {
                    if (disabledSearchAliases.hasOwnProperty(key)) {
                        delete disabledSearchAliases[key];
                    } else {
                        disabledSearchAliases[key] = prompt;
                    }

                    RUNTIME('updateSettings', {
                        settings: {
                            disabledSearchAliases
                        }
                    });
                };
            }
        });
    }

    function renderKeyMappings(rs) {
        initL10n(function (locale) {
            var customization = basicMappings.map(function (w, i) {
                var newKey = w.origin;
                if (rs.basicMappings && rs.basicMappings.hasOwnProperty(w.origin)) {
                    newKey = rs.basicMappings[w.origin];
                }
                return `<div>
                    <span class=annotation>${locale(w.annotation)}</span>
                    <span class=kbd-span><kbd data-origin="${w.origin}" data-custom="${newKey}">${newKey ? htmlEncode(newKey) : "🚫"}</kbd></span>
                </div>`;
            });

            setSanitizedContent(basicMappingsDiv, customization.join(""));
            basicMappingsDiv.querySelectorAll("kbd").forEach(function(d) {
                d.onclick = function () {
                    KeyPicker.enter(this);
                };
            });
        });
    }

    document.addEventListener("surfingkeys:userSettingsLoaded", function(evt) {
        const { settings, disabledSearchAliases, frontCommand } = evt.detail;
        mappingsEditor = createMappingEditor('mappings');
        renderSettings(settings);
        if ('error' in settings) {
            showBanner(settings.error, 5000);
        }
        renderSearchAlias(frontCommand, disabledSearchAliases || {});
        renderKeyMappings(settings);
    });

    var KeyPicker = (function() {
        var self = new Mode("KeyPicker");

        function showKey() {
            var s = htmlEncode(_key);
            if (!s) {
                s = "&nbsp;";
            }
            setSanitizedContent(document.getElementById("inputKey"), s);
        }

        var _key = "";
        var keyPickerDiv = document.getElementById("keyPicker");
        self.addEventListener('keydown', function(event) {
            if (event.keyCode === 27) {
                keyPickerDiv.hide();
                self.exit();
            } else if (event.keyCode === 8) {
                var ek = KeyboardUtils.encodeKeystroke(_key);
                ek = ek.substr(0, ek.length - 1);
                _key = KeyboardUtils.decodeKeystroke(ek);
                showKey();
            } else if (event.keyCode === 13) {
                keyPickerDiv.hide();
                self.exit();
                setSanitizedContent(_elm, (_key !== "") ? htmlEncode(_key) : "🚫");
                _elm.dataset.custom = _key;
                const realDefMap = {};
                Array.from(basicMappingsDiv.querySelectorAll("kbd")).forEach((m) => {
                    var n = m.dataset.custom;
                    if (m.dataset.origin !== n) {
                        realDefMap[m.dataset.origin] = n;
                    }
                });
                RUNTIME('updateSettings', {
                    settings: {
                        basicMappings: realDefMap
                    }
                });
            } else {
                if (event.sk_keyName.length > 1) {
                    var keyStr = JSON.stringify({
                        metaKey: event.metaKey,
                        altKey: event.altKey,
                        ctrlKey: event.ctrlKey,
                        shiftKey: event.shiftKey,
                        keyCode: event.keyCode,
                        code: event.code,
                        composed: event.composed,
                        key: event.key
                    }, null, 4);
                    reportIssue(`Unrecognized key event: ${event.sk_keyName}`, keyStr);
                } else {
                    _key += KeyboardUtils.decodeKeystroke(event.sk_keyName);
                    showKey();
                }
            }
            event.sk_stopPropagation = true;
        });

        var _elm;
        var _enter = self.enter;
        self.enter = function(elm) {
            _enter.call(self);

            _key = elm.innerText;
            if (_key === "🚫") {
                _key = "";
            }

            showKey();
            keyPickerDiv.show();
            _elm = elm;
        };

        return self;
    })();

    // --- Browser Defaults Reference ---
    // WHY: Users need to see which browser shortcuts exist and whether KitingKeys
    // can override them, so they can make informed keybinding decisions.
    var browserDefaultsToggle = document.getElementById("browserDefaultsToggle");
    var browserDefaultsContent = document.getElementById("browserDefaultsContent");
    if (browserDefaultsToggle) {
        browserDefaultsToggle.onclick = function() {
            if (browserDefaultsContent.style.display === "none") {
                browserDefaultsContent.style.display = "";
                browserDefaultsToggle.textContent = "Browser Default Shortcuts ▼";
                renderBrowserDefaults();
            } else {
                browserDefaultsContent.style.display = "none";
                browserDefaultsToggle.textContent = "Browser Default Shortcuts ▶";
            }
        };
    }

    var browserDefaultsRendered = false;
    function renderBrowserDefaults() {
        if (browserDefaultsRendered) return;
        browserDefaultsRendered = true;

        // Inline data to avoid import issues in content script context.
        // Mirrors src/content_scripts/common/browserDefaults.js
        var groups = {
            tabs: {
                label: "Tabs & Windows",
                shortcuts: [
                    { keys: "Ctrl+T", description: "Open new tab", overridable: false },
                    { keys: "Ctrl+N", description: "Open new window", overridable: false },
                    { keys: "Ctrl+Shift+N", description: "Open incognito window", overridable: false },
                    { keys: "Ctrl+W", description: "Close current tab", overridable: false },
                    { keys: "Ctrl+Shift+T", description: "Reopen closed tab", overridable: false },
                    { keys: "Ctrl+Tab", description: "Next tab", overridable: false },
                    { keys: "Ctrl+Shift+Tab", description: "Previous tab", overridable: false },
                    { keys: "Ctrl+1–8", description: "Go to tab 1–8", overridable: false },
                    { keys: "Ctrl+9", description: "Go to last tab", overridable: false },
                ],
            },
            navigation: {
                label: "Navigation",
                shortcuts: [
                    { keys: "Alt+←", description: "Go back", overridable: true },
                    { keys: "Alt+→", description: "Go forward", overridable: true },
                    { keys: "Ctrl+L", description: "Focus address bar", overridable: false },
                    { keys: "F5", description: "Reload", overridable: true },
                    { keys: "Ctrl+R", description: "Reload", overridable: false },
                    { keys: "Ctrl+Shift+R", description: "Hard reload", overridable: false },
                    { keys: "Escape", description: "Stop / close dialog", overridable: true },
                ],
            },
            page: {
                label: "Page Interaction",
                shortcuts: [
                    { keys: "Space", description: "Scroll down", overridable: true },
                    { keys: "Shift+Space", description: "Scroll up", overridable: true },
                    { keys: "Home", description: "Scroll to top", overridable: true },
                    { keys: "End", description: "Scroll to bottom", overridable: true },
                    { keys: "Page Down", description: "Scroll page down", overridable: true },
                    { keys: "Page Up", description: "Scroll page up", overridable: true },
                    { keys: "Tab", description: "Focus next element", overridable: true },
                ],
            },
            find: {
                label: "Find",
                shortcuts: [
                    { keys: "Ctrl+F", description: "Find on page", overridable: false },
                    { keys: "Ctrl+G", description: "Find next", overridable: false },
                    { keys: "Ctrl+Shift+G", description: "Find previous", overridable: false },
                    { keys: "F3", description: "Find next", overridable: true },
                ],
            },
            zoom: {
                label: "Zoom",
                shortcuts: [
                    { keys: "Ctrl++", description: "Zoom in", overridable: false },
                    { keys: "Ctrl+-", description: "Zoom out", overridable: false },
                    { keys: "Ctrl+0", description: "Reset zoom", overridable: false },
                ],
            },
            bookmarks: {
                label: "Bookmarks & History",
                shortcuts: [
                    { keys: "Ctrl+D", description: "Bookmark page", overridable: false },
                    { keys: "Ctrl+Shift+B", description: "Toggle bookmarks bar", overridable: false },
                    { keys: "Ctrl+H", description: "Open history", overridable: false },
                    { keys: "Ctrl+J", description: "Open downloads", overridable: false },
                ],
            },
            devtools: {
                label: "Developer Tools",
                shortcuts: [
                    { keys: "F12", description: "Toggle DevTools", overridable: true },
                    { keys: "Ctrl+Shift+I", description: "Toggle DevTools", overridable: false },
                    { keys: "Ctrl+Shift+J", description: "DevTools Console", overridable: false },
                    { keys: "Ctrl+Shift+C", description: "Inspect element", overridable: false },
                    { keys: "Ctrl+U", description: "View source", overridable: false },
                ],
            },
            misc: {
                label: "Miscellaneous",
                shortcuts: [
                    { keys: "Ctrl+P", description: "Print", overridable: false },
                    { keys: "Ctrl+S", description: "Save page", overridable: false },
                    { keys: "F11", description: "Toggle fullscreen", overridable: true },
                ],
            },
        };

        var html = "<table><tr><th>Shortcut</th><th>Action</th><th>Status</th></tr>";
        for (var cat in groups) {
            var g = groups[cat];
            html += "<tr><td colspan='3' class='category-header'>" + g.label + "</td></tr>";
            for (var i = 0; i < g.shortcuts.length; i++) {
                var s = g.shortcuts[i];
                var badge;
                if (s.overridable === true) {
                    badge = "<span class='badge-override'>overridable</span>";
                } else if (s.overridable === "commands") {
                    badge = "<span class='badge-commands'>via chrome.commands</span>";
                } else {
                    badge = "<span class='badge-locked'>locked</span>";
                }
                html += "<tr><td><kbd>" + s.keys + "</kbd></td><td>" + s.description + "</td><td>" + badge + "</td></tr>";
            }
        }
        html += "</table>";
        setSanitizedContent(document.getElementById("browserDefaultsList"), html);
    }

    // --- Preset Selector ---
    // WHY: Users need a quick way to switch between keybinding presets
    // (KitingKeys defaults, Vimium-style, or no extension keys at all).
    var applyPresetBtn = document.getElementById("applyPreset");
    var presetSelect = document.getElementById("presetSelect");
    var presetTip = document.getElementById("presetTip");
    if (applyPresetBtn) {
        applyPresetBtn.onclick = function() {
            var preset = presetSelect.value;
            if (!preset) {
                presetTip.textContent = "Please select a preset first.";
                return;
            }

            var confirmMsg;
            var snippets;
            switch (preset) {
                case "kitingkeys":
                    confirmMsg = "Restore all keybindings to KitingKeys (Surfingkeys) defaults?";
                    snippets = ""; // empty snippets = use built-in defaults
                    break;
                case "vimium":
                    confirmMsg = "Switch to Vimium-style keybindings? This will replace your current mappings.";
                    // WHY: We generate a user script snippet that unmaps all defaults
                    // then applies Vimium-compatible bindings.
                    snippets = [
                        "// Vimium-style preset - generated by KitingKeys",
                        "// Unmaps all default bindings, then applies Vimium equivalents.",
                        "api.unmapAllExcept([]);",
                        "",
                        "// --- Scrolling ---",
                        "api.mapkey('j', 'Scroll down', function() { api.Normal.scroll('down'); });",
                        "api.mapkey('k', 'Scroll up', function() { api.Normal.scroll('up'); });",
                        "api.mapkey('h', 'Scroll left', function() { api.Normal.scroll('left'); });",
                        "api.mapkey('l', 'Scroll right', function() { api.Normal.scroll('right'); });",
                        "api.mapkey('gg', 'Scroll to top', function() { api.Normal.scroll('top'); });",
                        "api.mapkey('G', 'Scroll to bottom', function() { api.Normal.scroll('bottom'); });",
                        "api.mapkey('d', 'Scroll half page down', function() { api.Normal.scroll('pageDown'); });",
                        "api.mapkey('u', 'Scroll half page up', function() { api.Normal.scroll('pageUp'); });",
                        "",
                        "// --- Links ---",
                        "api.mapkey('f', 'Open link in current tab', function() { api.Hints.click('a[href]'); });",
                        "api.mapkey('F', 'Open link in new tab', function() { api.Hints.click('a[href]', true); });",
                        "",
                        "// --- Navigation ---",
                        "api.mapkey('H', 'Go back', function() { history.go(-1); });",
                        "api.mapkey('L', 'Go forward', function() { history.go(1); });",
                        "",
                        "// --- Tabs ---",
                        "api.mapkey('J', 'Go one tab left', function() { api.RUNTIME('previousTab'); });",
                        "api.mapkey('K', 'Go one tab right', function() { api.RUNTIME('nextTab'); });",
                        "api.mapkey('x', 'Close tab', function() { api.RUNTIME('closeTab'); });",
                        "api.mapkey('X', 'Restore tab', function() { api.RUNTIME('openLast'); });",
                        "api.mapkey('t', 'Open URL', function() { api.Front.openOmnibar({type: 'URLs', tabbed: true}); });",
                        "api.mapkey('T', 'Search tabs', function() { api.Front.openOmnibar({type: 'Tabs'}); });",
                        "",
                        "// --- Clipboard ---",
                        "api.mapkey('yy', 'Copy current URL', function() { api.Clipboard.write(window.location.href); });",
                        "",
                        "// --- Find ---",
                        "api.mapkey('/', 'Find', function() { api.Front.openOmnibar({type: 'Find'}); });",
                        "api.mapkey('n', 'Next match', function() { api.Visual.next(false); });",
                        "api.mapkey('N', 'Previous match', function() { api.Visual.next(true); });",
                        "",
                        "// --- Visual ---",
                        "api.mapkey('v', 'Enter visual mode', function() { api.Visual.toggle(); });",
                        "",
                        "// --- Misc ---",
                        "api.mapkey('?', 'Show help', function() { api.Front.showUsage(); });",
                        "api.mapkey('r', 'Reload', function() { api.RUNTIME('reloadTab', { nocache: false }); });",
                        "api.mapkey('gi', 'Focus first input', function() { api.Hints.create('input,textarea,[contenteditable]'); });",
                    ].join("\n");
                    break;
                case "browser":
                    confirmMsg = "Remove ALL extension keybindings? Only browser defaults will remain.";
                    snippets = [
                        "// Browser defaults only - all KitingKeys mappings removed",
                        "api.unmapAllExcept([]);",
                    ].join("\n");
                    break;
            }

            if (!confirm(confirmMsg)) {
                presetTip.textContent = "Cancelled.";
                return;
            }

            RUNTIME('updateSettings', {
                settings: {
                    snippets: snippets,
                    basicMappings: {}
                }
            }, function() {
                if (preset === "kitingkeys") {
                    RUNTIME("resetSettings", null, function(response) {
                        renderSettings(response.settings);
                        renderKeyMappings(response.settings);
                        presetTip.textContent = "KitingKeys defaults restored.";
                    });
                } else {
                    // Reload to apply new snippets
                    presetTip.textContent = "Preset applied. Reloading...";
                    setTimeout(function() { location.reload(); }, 500);
                }
            });
        };
    }
}
