// =========================================================
// POLYFILLS (Patching old ExtendScript for AE)
// =========================================================

if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function(searchElement, fromIndex) {
        var k;
        if (this == null) throw new TypeError('"this" is null or not defined');
        var O = Object(this);
        var len = O.length >>> 0;
        if (len === 0) return -1;
        var n = +fromIndex || 0;
        if (Math.abs(n) === Infinity) n = 0;
        if (n >= len) return -1;
        k = Math.max(n >= 0 ? n : len - Math.abs(n), 0);
        while (k < len) {
            if (k in O && O[k] === searchElement) return k;
            k++;
        }
        return -1;
    };
}

try {
    var xLib = new ExternalObject("lib:\PlugPlugExternalObject");
} catch(e) { /* Ignore */ }

// =========================================================
// LOGGING SYSTEM
// =========================================================

function jsxLog(message) {
    try {
        if (typeof CSXSEvent !== "undefined") {
            var eventObj = new CSXSEvent();
            eventObj.type = "com.foldersorter.debug"; 
            eventObj.data = message.toString();
            eventObj.dispatch();
        }
    } catch(e) {}
}

// Entry Point
function runSorter() {
    try {
        var appName = BridgeTalk.appName;
        jsxLog("=== STARTER ===");
        jsxLog("App detected: " + appName);

        if (appName == "premierepro") {
            return sortPremiere();
        } else if (appName == "aftereffects") {
            return sortAfterEffects();
        } else {
            return "Unknown App: " + appName;
        }
    } catch (e) {
        var errInfo = "CRASH MAIN: " + e.message + " (Line: " + e.line + ")";
        jsxLog(errInfo);
        return errInfo;
    }
}

// =========================================================
// PREMIERE PRO LOGIC
// =========================================================
function sortPremiere() {
    jsxLog("--- Starting Premiere Sort ---");
    
    var project = app.project;
    if (!project) return "No project found";
    var root = project.rootItem;
    
    // --- CONFIGURATION ---
    var categories = {
        'jpg': 'Images', 'jpeg': 'Images', 'png': 'Images', 'gif': 'Images', 'tiff': 'Images', 'psd': 'Images', 'ai': 'Images', 'exr': 'jpg',
        'mp4': 'Video', 'mov': 'Video', 'avi': 'Video', 'mxf': 'Video', 'r3d': 'Video', 'mts': 'Video', 'braw': 'Video',
        'mp3': 'Audio', 'wav': 'Audio', 'aif': 'Audio', 'wma': 'Audio', 'aac': 'Audio',
        'xml': 'Data', 'csv': 'Data', 'srt': 'Data',
        'aep': 'Dynamic Link', 'prproj': 'Dynamic Link', 'plb': 'Dynamic Link'
    };

    var templateTargetNames = [
        "Atom", 
        "Premiere Composer Files", 
        "Motion Graphics Template Media", 
        "Motion Bro", 
        "AEJuice", 
        "Files From AEJuice", 
        "Envato", 
        "Motion Array", 
        "Storyblocks"
    ];
    
    var templatesFolderName = "Templates";
    var itemsToMove = [];
    var binCache = {};

    // =========================================================
    // PHASE 1: FILE SCANNING & SORTING
    // =========================================================
    jsxLog("Phase 1: Scanning root (" + root.children.numItems + " items)...");
    
    for (var i = 0; i < root.children.numItems; i++) {
        var item = root.children[i];
        if (!item) continue;

        if (item.type === 2) continue; // Skip Bins in Phase 1

        var targetFolder = "Others";
        var shouldMove = false;
        var isSeq = false;
        var mediaPath = "";

        if (item.type === 1) { 
            try { mediaPath = item.getMediaPath(); } catch(e){}
        }

        // 1. SEQUENCE DETECTION
        if (item.type === 1) {
            if (typeof item.isSequence === 'function') {
                isSeq = item.isSequence();
            } else {
                isSeq = (mediaPath === undefined || mediaPath === "" || mediaPath === null);
            }
        }

        if (isSeq) {
            targetFolder = "Sequences";
            shouldMove = true;
        } 
        // 2. GENERIC LAYERS DETECTION (Adjustment Layers, etc.)
        else if (!mediaPath || mediaPath === "") {
            targetFolder = "Generic Layers";
            shouldMove = true;
        }
        // 3. FILE BASED SORTING
        else {
            var parts = item.name.split('.');
            if (parts.length > 1) {
                var ext = parts.pop().toLowerCase();
                if (categories[ext]) {
                    targetFolder = categories[ext];
                    shouldMove = true;
                }
            }
        }

        if (shouldMove) {
            itemsToMove.push({item: item, folderName: targetFolder});
        }
    }

    // =========================================================
    // PHASE 2: EXECUTING FILE MOVES
    // =========================================================
    if (itemsToMove.length > 0) {
        jsxLog("Phase 2: Moving " + itemsToMove.length + " files...");
        
        var uniqueFolders = {};
        for (var k = 0; k < itemsToMove.length; k++) {
            uniqueFolders[itemsToMove[k].folderName] = true;
        }

        for (var fName in uniqueFolders) {
            if (!binCache[fName]) {
                binCache[fName] = findOrCreateBin(root, fName);
            }
        }

        var movedCount = 0;
        for (var j = 0; j < itemsToMove.length; j++) {
            var t = itemsToMove[j];
            var targetBin = binCache[t.folderName];
            if (targetBin) {
                try {
                    if (t.item.treePath !== targetBin.treePath) {
                        t.item.moveBin(targetBin);
                        movedCount++;
                    }
                } catch(moveErr) {}
            }
        }
        jsxLog("-> Files moved: " + movedCount);
    }

    // =========================================================
    // PHASE 3: TEMPLATES DEEP MERGE (Recursive)
    // =========================================================
    jsxLog("Phase 3: Processing Template Folders (Deep Merge)...");
    
    var detectedTemplateFolders = [];
    for (var r = 0; r < root.children.numItems; r++) {
        var rItem = root.children[r];
        if (rItem.type === 2) { 
             if (templateTargetNames.indexOf(rItem.name) !== -1) {
                 detectedTemplateFolders.push(rItem);
             }
        }
    }

    if (detectedTemplateFolders.length > 0) {
        var masterTemplateBin = findOrCreateBin(root, templatesFolderName);

        for (var t = 0; t < detectedTemplateFolders.length; t++) {
            var sourceBin = detectedTemplateFolders[t];
            var binName = sourceBin.name;
            jsxLog("Processing detected folder: " + binName);

            // Find match inside Templates
            var targetBin = findBinInBin(masterTemplateBin, binName);

            if (targetBin) {
                // RECURSIVE MERGE
                jsxLog(" -> Target exists. Starting Deep Merge...");
                mergeBinsRecursively(sourceBin, targetBin);
                
                // If the root parasite is now empty, delete it
                if (sourceBin.children.numItems === 0) {
                    sourceBin.deleteBin();
                }
            } else {
                // SIMPLE MOVE (No match found, safe to move whole tree)
                jsxLog(" -> Target missing. Moving bin...");
                try {
                    sourceBin.moveBin(masterTemplateBin);
                } catch(e) {
                    jsxLog("Error moving bin: " + e.message);
                }
            }
        }
    } else {
        jsxLog("-> No template folders found in root.");
    }

    jsxLog("--- Premiere Sort Complete ---");
    return "Sorted files and templates.";
}

// === RECURSIVE MERGE FUNCTION (PPro) ===
function mergeBinsRecursively(sourceBin, targetBin) {
    // Iterate BACKWARDS because we are moving/deleting items
    for (var i = sourceBin.children.numItems - 1; i >= 0; i--) {
        var item = sourceBin.children[i];

        if (item.type === 2) { // It is a Bin
            // Check if this sub-bin exists in target
            var match = findBinInBin(targetBin, item.name);
            
            if (match) {
                // Sub-bin exists! DIVE DEEPER (Recursion)
                mergeBinsRecursively(item, match);
                
                // If we moved everything out of this sub-bin, delete it
                if (item.children.numItems === 0) {
                    item.deleteBin();
                }
            } else {
                // Sub-bin does NOT exist in target. Move the whole thing.
                item.moveBin(targetBin);
            }
        } else {
            // It is a Clip/Sequence. Just move it.
            item.moveBin(targetBin);
        }
    }
}


// =========================================================
// AFTER EFFECTS LOGIC
// =========================================================
function sortAfterEffects() {
    jsxLog("--- Starting AE Sort (Final Release) ---");
    var project = app.project;
    app.beginUndoGroup("Folder Sorter");

    try {
        var items = project.items;
        var extensions = {};
        var precomps = [];
        var count = 0;

        var templateTargetNames = [
            "AC Precomps",        
            "Motion Bro", 
            "AEJuice", 
            "Files From AEJuice",
            "Envato", 
            "Motion Array", 
            "Storyblocks"
        ];
        var templatesFolderName = "Templates";

        // =========================================================
        // PHASE 1: STANDARD SORTING
        // =========================================================
        for (var i = 1; i <= items.length; i++) {
            var item = items[i];
            if (item.parentFolder !== project.rootFolder) continue;
            
            var ext = "";
            var isFolder = (item instanceof FolderItem);

            if (isFolder) {
                var lowerName = item.name.toLowerCase();
                if (lowerName.slice(-4) === ".aep" || lowerName.slice(-5) === ".aepx") {
                    ext = "dl";
                } else {
                    continue; 
                }
            } else if (item instanceof FootageItem) {
                if (item.mainSource instanceof SolidSource) continue; 
                if (item.mainSource instanceof PlaceholderSource) continue;
                if (ext === "") {
                    try {
                        var parts = item.name.split('.');
                        if (parts.length > 1) ext = parts.pop().toLowerCase();
                    } catch(e) {}
                }

                if (['jpeg', 'jpg', 'png', 'tiff', 'tif', 'psd', 'exr', 'tga', 'webp', 'bmp'].indexOf(ext) !== -1) ext = 'images';
                if (['mov', 'mp4', 'mxf', 'avi', 'webm', 'mkv', 'flv', 'r3d', 'braw', 'mts'].indexOf(ext) !== -1) ext = 'video';
                if (['ai', 'eps', 'pdf', 'svg'].indexOf(ext) !== -1) ext = 'vector';
                if (['wav', 'mp3', 'aac', 'm4a', 'wma', 'aiff'].indexOf(ext) !== -1) ext = 'audio';
                if (['glb', 'gltf', 'sbsar', 'obj', 'fbx', 'c4d'].indexOf(ext) !== -1) ext = '3d';
                if (['aep', 'aepx', 'prproj'].indexOf(ext) !== -1) ext = 'dl';
            } else if (item instanceof CompItem) {
                if (!isAdjustmentLayerComp(item)) precomps.push(item);
                continue; 
            }

            if (ext !== "") {
                if (!extensions[ext]) extensions[ext] = [];
                extensions[ext].push(item);
            }
        }

        // Execute Moves
        for (var ext in extensions) {
            if (ext === "") continue; 
            var folderName = "Others"; 
            if (ext === 'images') folderName = "Images";
            if (ext === 'video')  folderName = "Video Files";
            if (ext === 'vector') folderName = "Vector Files";
            if (ext === 'audio')  folderName = "Audio Files";
            if (ext === '3d')     folderName = "3D Models";
            if (ext === 'dl')     folderName = "Dynamic Link";

            if (['images', 'video', 'vector', 'audio', '3d', 'dl'].indexOf(ext) === -1) folderName = ext.toUpperCase() + " Files";

            var targetFolder = findOrCreateFolderAE(folderName);
            var list = extensions[ext];
            for (var j = 0; j < list.length; j++) {
                try {
                    if (list[j].id !== targetFolder.id) {
                        list[j].parentFolder = targetFolder;
                        count++;
                    }
                } catch(err) {}
            }
        }

        if (precomps.length > 0) {
            var precompFolder = findOrCreateFolderAE("Compositions");
            for (var k = 0; k < precomps.length; k++) {
                precomps[k].parentFolder = precompFolder;
                count++;
            }
        }

        // =========================================================
        // PHASE 2: AE TEMPLATES DEEP MERGE
        // =========================================================
        jsxLog("Phase 2: Templates Deep Merge...");
        
        var masterTemplateFolder = null;
        // Find main Templates folder
        for (var m = 1; m <= items.length; m++) {
            if (items[m] instanceof FolderItem && items[m].name === templatesFolderName && items[m].parentFolder === project.rootFolder) {
                masterTemplateFolder = items[m];
                break;
            }
        }

        // Identify Parasites
        var parasites = [];
        for (var p = 1; p <= items.length; p++) {
            var pItem = items[p];
            if (pItem instanceof FolderItem && pItem.parentFolder === project.rootFolder) {
                 if (templateTargetNames.indexOf(pItem.name) !== -1) {
                     parasites.push(pItem);
                 }
            }
        }

        if (parasites.length > 0) {
            if (!masterTemplateFolder) masterTemplateFolder = project.items.addFolder(templatesFolderName);
            
            for (var t = 0; t < parasites.length; t++) {
                var source = parasites[t];
                jsxLog("Processing detected folder: " + source.name);

                // Check for existing subfolder inside Templates
                var existingSub = null;
                var allItems = project.items; 
                for (var s = 1; s <= allItems.length; s++) {
                    if (allItems[s] instanceof FolderItem && allItems[s].parentFolder === masterTemplateFolder && allItems[s].name === source.name) {
                        existingSub = allItems[s];
                        break;
                    }
                }

                if (existingSub) {
                    jsxLog(" -> Target exists. Deep Merging...");
                    mergeFoldersRecursivelyAE(source, existingSub);
                    
                    // Check if empty and delete
                    if (getChildrenAE(source).length === 0) source.remove();
                } else {
                    jsxLog(" -> Moving folder...");
                    source.parentFolder = masterTemplateFolder;
                }
                count++;
            }
        }

        removeEmptyFoldersAE();
        app.endUndoGroup();
        return "Sorted " + count + " items";

    } catch (e) {
        app.endUndoGroup();
        var errArgs = "CRASH AE: " + e.message + " (Line: " + e.line + ")";
        jsxLog(errArgs);
        return errArgs;
    }
}

// === RECURSIVE MERGE FUNCTION (AE) ===
function mergeFoldersRecursivelyAE(sourceFolder, targetFolder) {
    // AE doesn't have .children property, so we must scan using helper.
    var children = getChildrenAE(sourceFolder);
    
    for (var i = 0; i < children.length; i++) {
        var item = children[i];
        
        if (item instanceof FolderItem) {
            // Does this folder exist in target?
            var match = null;
            var targetChildren = getChildrenAE(targetFolder);
            for (var t = 0; t < targetChildren.length; t++) {
                if (targetChildren[t] instanceof FolderItem && targetChildren[t].name === item.name) {
                    match = targetChildren[t];
                    break;
                }
            }

            if (match) {
                // Recurse
                mergeFoldersRecursivelyAE(item, match);
                // Remove if empty
                if (getChildrenAE(item).length === 0) item.remove();
            } else {
                // Move whole folder
                item.parentFolder = targetFolder;
            }
        } else {
            // Footage/Comp - just move
            item.parentFolder = targetFolder;
        }
    }
}


// =========================================================
// UTILITIES
// =========================================================

// PR Utilities
function findOrCreateBin(parentItem, name) {
    for (var i = 0; i < parentItem.children.numItems; i++) {
        var current = parentItem.children[i];
        if (current.type === 2 && current.name === name) {
            return current;
        }
    }
    return parentItem.createBin(name);
}

function findBinInBin(parentBin, name) {
    for (var i = 0; i < parentBin.children.numItems; i++) {
        var current = parentBin.children[i];
        if (current.type === 2 && current.name === name) {
            return current;
        }
    }
    return null;
}

// AE Utilities
function getChildrenAE(folderItem) {
    var children = [];
    var items = app.project.items;
    for (var i = 1; i <= items.length; i++) {
        if (items[i].parentFolder === folderItem) children.push(items[i]);
    }
    return children;
}

function findOrCreateFolderAE(name) {
    var items = app.project.items;
    for (var i = 1; i <= items.length; i++) {
        if (items[i] instanceof FolderItem && items[i].name === name) return items[i];
    }
    return app.project.items.addFolder(name);
}

function isAdjustmentLayerComp(comp) {
    if (comp.numLayers === 1) {
        return comp.layer(1).adjustmentLayer;
    }
    return false;
}

function removeEmptyFoldersAE() {
    var project = app.project;
    for (var i = project.items.length; i >= 1; i--) {
        var item = project.items[i];
        if (item instanceof FolderItem && item.numItems === 0 && item.parentFolder === project.rootFolder) {
            if (item.name !== "Solids") item.remove();
        }
    }
}