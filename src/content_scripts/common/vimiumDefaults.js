// Vimium default keybindings expressed as KitingKeys mappings.
// WHY: Provides a familiar preset for users migrating from Vimium.
// These mappings use the KitingKeys API (mapkey, map, etc.) and mirror
// Vimium's default behavior as closely as possible within KitingKeys' mode system.
//
// See also:
//   src/content_scripts/common/default.js - KitingKeys/Surfingkeys defaults
//   src/content_scripts/common/api.js - mapping API (mapkey, map, unmap, etc.)

export default function(api, clipboard, insert, normal, hints, visual, front, browser) {
    const {
        map,
        mapkey,
        vmapkey,
        cmap,
        unmap,
    } = api;

    // --- Scrolling ---
    mapkey('j', '#2Scroll down', function() {
        normal.scroll("down");
    });
    mapkey('k', '#2Scroll up', function() {
        normal.scroll("up");
    });
    mapkey('h', '#2Scroll left', function() {
        normal.scroll("left");
    });
    mapkey('l', '#2Scroll right', function() {
        normal.scroll("right");
    });
    mapkey('gg', '#2Scroll to top', function() {
        normal.scroll("top");
    });
    mapkey('G', '#2Scroll to bottom', function() {
        normal.scroll("bottom");
    });
    mapkey('d', '#2Scroll half page down', function() {
        normal.scroll("pageDown");
    });
    mapkey('u', '#2Scroll half page up', function() {
        normal.scroll("pageUp");
    });

    // --- Link hints ---
    mapkey('f', '#1Open a link in current tab', function() {
        hints.create("", hints.dispatchMouseClick);
    }, {repeatIgnore: true});
    mapkey('F', '#1Open a link in new tab', function() {
        hints.create("", hints.dispatchMouseClick, {tabbed: true, active: false});
    }, {repeatIgnore: true});

    // --- Navigation ---
    mapkey('H', '#4Go back in history', function() {
        history.go(-1);
    }, {repeatIgnore: true});
    mapkey('L', '#4Go forward in history', function() {
        history.go(1);
    }, {repeatIgnore: true});

    mapkey('gu', '#4Go up one path in the URL', function() {
        var pathname = location.pathname;
        if (pathname.length > 1) {
            pathname = pathname.endsWith('/') ? pathname.substr(0, pathname.length - 1) : pathname;
            var last = pathname.lastIndexOf('/');
            pathname = pathname.substr(0, last);
        }
        window.location.href = location.origin + pathname;
    });
    mapkey('gU', '#4Go to root of site', function() {
        window.location.href = location.origin + '/';
    });

    // --- Tab management ---
    mapkey('J', '#3Go one tab left', function() {
        RUNTIME("previousTab");
    });
    mapkey('K', '#3Go one tab right', function() {
        RUNTIME("nextTab");
    });
    mapkey('g0', '#3Go to first tab', function() {
        RUNTIME("firstTab");
    });
    mapkey('g$', '#3Go to last tab', function() {
        RUNTIME("lastTab");
    });
    mapkey('t', '#3Open URL in new tab', function() {
        front.openOmnibar({type: "URLs", tabbed: true});
    });
    mapkey('T', '#3Search through open tabs', function() {
        front.chooseTab();
    });
    mapkey('x', '#3Close current tab', function() {
        RUNTIME("closeTab");
    });
    mapkey('X', '#3Restore closed tab', function() {
        RUNTIME("openLast");
    });
    mapkey('^', '#3Go to previously visited tab', function() {
        RUNTIME("goToLastTab");
    });

    // --- Find ---
    mapkey('/', '#9Open find bar', function() {
        front.openOmnibar({type: "Find"});
    });
    mapkey('n', '#9Next found text', function() {
        visual.next(false);
    }, {repeatIgnore: true});
    mapkey('N', '#9Previous found text', function() {
        visual.next(true);
    }, {repeatIgnore: true});

    // --- Visual mode ---
    mapkey('v', '#9Enter visual mode', function() {
        visual.toggle();
    }, {repeatIgnore: true});

    // --- Yank / Clipboard ---
    mapkey('yy', '#7Copy current URL', function() {
        clipboard.write(window.location.href);
    });
    mapkey('yf', '#7Copy link URL', function() {
        hints.create('*[href]', function(element) {
            clipboard.write(element.href);
        });
    });
    mapkey('p', '#7Open clipboard URL in current tab', function() {
        clipboard.read(function(response) {
            window.location.href = response.data;
        });
    });
    mapkey('P', '#7Open clipboard URL in new tab', function() {
        clipboard.read(function(response) {
            tabOpenLink(response.data);
        });
    });

    // --- Insert mode ---
    mapkey('i', '#1Go to edit box', function() {
        hints.create("input, textarea, [contenteditable]", hints.dispatchMouseClick);
    });

    // --- Focus ---
    mapkey('gi', '#1Focus first input', function() {
        hints.createInputLayer();
    });

    // --- Marks ---
    mapkey('m', '#10Create mark', normal.addVIMark);
    mapkey("'", '#10Go to mark', normal.jumpVIMark);

    // --- Misc ---
    mapkey('?', '#0Show help', function() {
        front.showUsage();
    });
    mapkey('r', '#4Reload page', function() {
        RUNTIME("reloadTab", { nocache: false });
    });
    mapkey('gs', '#4View page source', function() {
        RUNTIME("viewSource");
    });

    // --- Omnibar arrows ---
    cmap('<ArrowDown>', '<Ctrl-n>');
    cmap('<ArrowUp>', '<Ctrl-p>');
}
