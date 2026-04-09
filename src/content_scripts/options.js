// WHY: options.js is bundled by webpack (moduleEntries in webpack.config.js) and loaded
// via dynamic import() in content.js. Because webpack processes this file, we can directly
// import the new component classes — webpack follows the import chain and bundles them in.
// This avoids the complexity of a window-global bridge between ES modules and webpack bundles.
import { BindingRegistry } from '../pages/bindingRegistry.js';
import { KeybindingsTable } from '../pages/keybindingsTable.js';

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
    // --- Registry and table instances (F009: registry as sole source of truth) ---
    var registry = null;
    var table = null;

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

    var localPathSaved = "";
    var localPathInput = document.getElementById("localPath");
    var sample = document.getElementById("sample").innerHTML;
    function renderSettings(rs) {
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

    // WHY: .infoPointer may not exist in the new VSCode-style settings layout.
    var infoPointer = document.querySelector('.infoPointer');
    if (infoPointer) {
        infoPointer.onclick = function() {
            var f = document.getElementById(this.getAttribute("for"));
            if (f.style.display === "none") {
                f.style.display = "";
            } else {
                f.style.display = "none";
            }
        };
    }

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

    // --- F009: Registry as sole source of truth ---
    // WHY: surfingkeys:defaultSettingsLoaded fires once with the built-in trie mappings
    // for all modes. We create the BindingRegistry here and populate it from the tries.
    // The registry merges extension defaults + browser defaults into one flat list.
    document.addEventListener("surfingkeys:defaultSettingsLoaded", function(evt) {
        const { normal, insert, visual } = evt.detail;

        registry = new BindingRegistry();
        registry.initFromTrie(
            normal ? normal.mappings : null,
            insert ? insert.mappings : null,
            visual ? visual.mappings : null
        );

        // WHY: Expose registry on window so settingsShell.js (loaded as a separate
        // ES module in options.html) can access it if needed for future coordination.
        window.__kitingkeys_registry = registry;
    });

    // --- F001: Unified keybinding table populated from registry ---
    // WHY: surfingkeys:userSettingsLoaded fires after user settings are read from
    // chrome.storage. We apply user overrides to the registry, then render the table.
    document.addEventListener("surfingkeys:userSettingsLoaded", function(evt) {
        const { settings, disabledSearchAliases, frontCommand } = evt.detail;

        // Apply user overrides to the registry (F009)
        if (registry) {
            registry.initFromStorage(settings.basicMappings || {});
        }

        // F001: Create and render the unified keybindings table
        var container = document.getElementById('bindings-table-container');
        if (registry && container) {
            table = new KeybindingsTable(container, registry);
            table.render();
        }

        // WHY: snapshot the saved state so the draft model can detect real changes
        _snapshotSavedKeys();

        // Ace editor for Advanced JS tab (preserved)
        mappingsEditor = createMappingEditor('mappings');
        renderSettings(settings);
        if ('error' in settings) {
            showBanner(settings.error, 5000);
        }

        // Search aliases (preserved)
        renderSearchAlias(frontCommand, disabledSearchAliases || {});
    });

    // --- F007: Preset system dispatching through registry ---
    // WHY: settingsShell.js dispatches kitingkeys:applyPreset events when the user
    // selects a preset from the dropdown. We handle them here because options.js
    // owns RUNTIME (for persistence) and the registry instance.
    document.addEventListener("kitingkeys:applyPreset", function(evt) {
        var detail = evt.detail || {};
        var preset = detail.preset;
        if (!registry) return;

        if (preset === 'export') {
            // WHY: Export dispatches a response event that settingsShell.js listens for
            // to trigger the file download. The registry owns the data.
            var exportJson = registry.exportBindings();
            var exportData;
            try {
                exportData = JSON.parse(exportJson);
            } catch (e) {
                exportData = {};
            }
            document.dispatchEvent(new CustomEvent('kitingkeys:exportReady', {
                detail: { data: exportData }
            }));
            return;
        }

        if (preset === 'import') {
            // WHY: Import data comes from the file reader in settingsShell.js,
            // passed via the event detail.
            var importData = detail.data;
            if (!importData) return;
            try {
                registry.importBindings(JSON.stringify(importData));
            } catch (e) {
                showBanner('Import failed: ' + e.message, 3000);
                return;
            }
            // WHY: Presets are intentional bulk changes — persist immediately
            _persistBindings();
            _snapshotSavedKeys();
            pendingChanges = {};
            _dispatchPendingUpdate();
            if (table) table.refresh();
            showBanner('Bindings imported', 1000);
            return;
        }

        // Named presets: kitingkeys, vimium, minimal
        if (preset === 'kitingkeys' || preset === 'vimium' || preset === 'minimal') {
            registry.applyPreset(preset);
            // WHY: Presets are intentional bulk changes — persist immediately
            _persistBindings();
            _snapshotSavedKeys();
            pendingChanges = {};
            _dispatchPendingUpdate();
            if (table) table.refresh();
            showBanner('Preset "' + preset + '" applied', 1000);
        }
    });

    // --- Draft model: pending changes tracker (T017) ---
    // WHY: Instead of persisting every inline edit immediately, we buffer changes
    // until the user explicitly clicks Save. This prevents accidental partial
    // saves and lets the user experiment freely before committing.
    var pendingChanges = {};  // { bindingId: { oldKeys, newKeys } }

    /**
     * Record a change as pending (unsaved).
     * If the new value matches the previously-saved value, remove it from pending
     * (the user reverted that particular edit manually).
     */
    function _trackPendingChange(id, newKeys) {
        if (!registry) return;

        // WHY: We need the keys as they were at last save (not current in-memory,
        // which already reflects the edit). Use savedKeys snapshot if available,
        // otherwise fall back to what was stored before any edits in this session.
        var savedKeys;
        if (pendingChanges[id]) {
            // Already tracking — keep the original oldKeys
            savedKeys = pendingChanges[id].oldKeys;
        } else {
            // First edit to this binding in this session — snapshot current saved state.
            // The registry already updated in-memory, so we need the value from _defaults
            // for default entries, or reconstruct from the last-persisted state.
            // WHY: _lastSavedKeys stores a snapshot of all keys at last save/load.
            savedKeys = _lastSavedKeys[id];
            if (savedKeys === undefined) {
                // Fallback: use the registry default
                savedKeys = registry._defaults.get(id) || '';
            }
        }

        if (newKeys === savedKeys) {
            // WHY: user manually reverted this binding to its saved state — no longer pending
            delete pendingChanges[id];
        } else {
            pendingChanges[id] = { oldKeys: savedKeys, newKeys: newKeys };
        }

        _dispatchPendingUpdate();
    }

    function _dispatchPendingUpdate() {
        var count = Object.keys(pendingChanges).length;
        document.dispatchEvent(new CustomEvent('kitingkeys:pendingChangesUpdated', {
            detail: { count: count, ids: Object.keys(pendingChanges) }
        }));
        // WHY: Also update the visual pending indicators on table rows
        if (table) {
            table.markPending(new Set(Object.keys(pendingChanges)));
        }
    }

    /**
     * Snapshot of each binding's keys as of the last save/load.
     * Used to detect whether an edit is truly a change or a revert-to-saved.
     */
    var _lastSavedKeys = {};

    function _snapshotSavedKeys() {
        _lastSavedKeys = {};
        if (!registry) return;
        var all = registry.getAllBindings();
        for (var i = 0; i < all.length; i++) {
            if (all[i].source === 'browser') continue;
            _lastSavedKeys[all[i].id] = all[i].keys;
        }
    }

    // WHY: Listen for binding changes from the table's inline editor (F005).
    // Under the draft model, we track the change as pending instead of persisting.
    document.addEventListener("kitingkeys:bindingChanged", function(evt) {
        var detail = evt.detail || {};
        _trackPendingChange(detail.id, detail.newKeys);
    });

    // WHY: Save button persists ALL pending changes to chrome.storage at once.
    document.addEventListener("kitingkeys:saveChanges", function() {
        if (Object.keys(pendingChanges).length === 0) return;
        _persistBindings();
        _snapshotSavedKeys();
        pendingChanges = {};
        _dispatchPendingUpdate();
    });

    // WHY: Revert button discards ALL pending changes and restores the registry
    // to the last-saved state.
    document.addEventListener("kitingkeys:revertChanges", function() {
        if (Object.keys(pendingChanges).length === 0) return;
        // Restore each pending binding to its saved keys
        for (var id in pendingChanges) {
            if (!pendingChanges.hasOwnProperty(id)) continue;
            var oldKeys = pendingChanges[id].oldKeys;
            var entry = registry._entries.get(id);
            if (!entry) continue;
            entry.keys = oldKeys;
            entry.keysEncoded = oldKeys ? KeyboardUtils.encodeKeystroke(oldKeys) : '';
            // WHY: restore the source based on whether oldKeys matches the default
            var defaultKeys = registry._defaults.get(id);
            entry.source = (oldKeys === defaultKeys) ? 'default' : 'user';
        }
        registry._detectConflicts();
        pendingChanges = {};
        _dispatchPendingUpdate();
        if (table) table.refresh();
    });

    /**
     * Persist current registry overrides to chrome.storage via RUNTIME.
     * WHY: The registry tracks all changes in memory. We extract the diff
     * (user-modified bindings vs defaults) and save it as basicMappings,
     * which is the format the extension already understands.
     */
    function _persistBindings() {
        if (!registry) return;

        // Build basicMappings object: { originalKeys: newKeys } for user-modified entries
        var allBindings = registry.getAllBindings();
        var basicMappings = {};
        for (var i = 0; i < allBindings.length; i++) {
            var entry = allBindings[i];
            if (entry.source === 'browser') continue;
            if (entry.source !== 'user') continue;
            // Find the default keys for this entry
            var defaultKeys = registry._defaults.get(entry.id);
            if (defaultKeys !== undefined && entry.keys !== defaultKeys) {
                basicMappings[defaultKeys] = entry.keys;
            }
        }
        RUNTIME('updateSettings', {
            settings: {
                basicMappings: basicMappings
            }
        });
    }
}
