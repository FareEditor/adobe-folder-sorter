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
        if (appName == "premierepro") return sortPremiere();
        else if (appName == "aftereffects") return sortAfterEffects();
        else return "Unknown App: " + appName;
    } catch (e) {
        return "CRASH MAIN: " + e.message + " (Line: " + e.line + ")";
    }
}

// =========================================================
// PREMIERE PRO LOGIC
// =========================================================
function sortPremiere() {
    var project = app.project;
    if (!project) return "No project found";
    var root = project.rootItem;
    
    var categories = {
        'jpg': 'Images', 'jpeg': 'Images', 'png': 'Images', 'gif': 'Images', 'tiff': 'Images', 'psd': 'Images', 'ai': 'Images',
        'mp4': 'Video', 'mov': 'Video', 'avi': 'Video', 'mxf': 'Video', 'r3d': 'Video', 'mts': 'Video', 'braw': 'Video',
        'mp3': 'Audio', 'wav': 'Audio', 'aif': 'Audio', 'wma': 'Audio', 'aac': 'Audio',
        'xml': 'Data', 'csv': 'Data', 'srt': 'Data',
        'aep': 'Dynamic Link', 'prproj': 'Dynamic Link', 'plb': 'Dynamic Link'
    };

    var templateTargetNames = [
        "Atom", "Premiere Composer Files", "Motion Graphics Template Media", 
        "Motion Bro", "AEJuice", "Files From AEJuice", "Envato", 
        "Motion Array", "Storyblocks", "AA_POWER"
    ];
    
    var templatesFolderName = "Templates";
    var itemsToMove = [];
    var binCache = {};

    // PHASE 1: FILE SCANNING
    for (var i = 0; i < root.children.numItems; i++) {
        var item = root.children[i];
        if (!item || item.type === 2) continue;

        var targetFolder = "Others";
        var shouldMove = false;
        var isSeq = false;
        var mediaPath = "";

        if (item.type === 1) { 
            try { mediaPath = item.getMediaPath(); } catch(e){} 
        }

        if (item.type === 1) {
            if (typeof item.isSequence === 'function') isSeq = item.isSequence();
            else isSeq = (!mediaPath || mediaPath === "");
        }

        if (isSeq) {
            targetFolder = "Sequences";
            shouldMove = true;
        } 
        else if (!mediaPath || mediaPath === "") {
            targetFolder = "Generic Layers";
            shouldMove = true;
        }
        else {
            var parts = item.name.split('.');
            if (parts.length > 1) {
                var ext = parts.pop().toLowerCase();
                if (categories[ext]) {
                    targetFolder = categories[ext];
                    shouldMove = true;

                    // Epidemic Sound & Audio Sub-sorting Logic
                    if (targetFolder === 'Audio') {
                        var isES = (item.name.indexOf("ES_") === 0);
                        var pathUpper = mediaPath.toUpperCase();
                        var hasSFX = (pathUpper.indexOf("\\SFX\\") !== -1 || pathUpper.indexOf("/SFX/") !== -1);
                        var hasMusic = (pathUpper.indexOf("\\MUSIC\\") !== -1 || pathUpper.indexOf("/MUSIC/") !== -1);
                        
                        if (isES || hasSFX || hasMusic) {
                            if (hasSFX || (isES && item.name.toUpperCase().indexOf("SFX") !== -1)) {
                                targetFolder += "/SFX";
                            } else {
                                targetFolder += "/Music";
                            }
                        }
                    }
                }
            }
        }

        if (shouldMove) {
            itemsToMove.push({item: item, folderName: targetFolder});
        }
    }

    // PHASE 2: MOVING FILES
    if (itemsToMove.length > 0) {
        var uniqueFolders = {};
        for (var k = 0; k < itemsToMove.length; k++) uniqueFolders[itemsToMove[k].folderName] = true;

        for (var fName in uniqueFolders) {
            if (!binCache[fName]) {
                binCache[fName] = findOrCreateBin(root, fName); // Теперь поддерживает вложенность вида "Audio/SFX"
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
    }

    // PHASE 3: TEMPLATES DEEP MERGE
    var detectedTemplateFolders = [];
    for (var r = 0; r < root.children.numItems; r++) {
        var rItem = root.children[r];
        if (rItem.type === 2 && templateTargetNames.indexOf(rItem.name) !== -1) { 
             detectedTemplateFolders.push(rItem);
        }
    }

    if (detectedTemplateFolders.length > 0) {
        var masterTemplateBin = findOrCreateBin(root, templatesFolderName);

        for (var t = 0; t < detectedTemplateFolders.length; t++) {
            var sourceBin = detectedTemplateFolders[t];
            var targetBin = findBinInBin(masterTemplateBin, sourceBin.name);

            if (targetBin) {
                mergeBinsRecursively(sourceBin, targetBin);
                if (sourceBin.children.numItems === 0) sourceBin.deleteBin();
            } else {
                try { sourceBin.moveBin(masterTemplateBin); } catch(e) {}
            }
        }
    }

    return "Sorted files and templates.";
}

function mergeBinsRecursively(sourceBin, targetBin) {
    for (var i = sourceBin.children.numItems - 1; i >= 0; i--) {
        var item = sourceBin.children[i];
        if (item.type === 2) { 
            var match = findBinInBin(targetBin, item.name);
            if (match) {
                mergeBinsRecursively(item, match);
                if (item.children.numItems === 0) item.deleteBin();
            } else {
                item.moveBin(targetBin);
            }
        } else {
            item.moveBin(targetBin);
        }
    }
}


// =========================================================
// AFTER EFFECTS LOGIC
// =========================================================
function sortAfterEffects() {
    var project = app.project;
    app.beginUndoGroup("Folder Sorter");

    try {
        var items = project.items;
        var sortGroups = {}; // Теперь хранит готовые пути, а не просто расширения
        var precomps = [];
        var count = 0;

        var templateTargetNames = [
            "AC Precomps", "Motion Bro", "AEJuice", "Files From AEJuice",
            "Envato", "Motion Array", "Storyblocks", "AA_POWER"
        ];
        var templatesFolderName = "Templates";

        // PHASE 1: STANDARD SORTING
        for (var i = 1; i <= items.length; i++) {
            var item = items[i];
            if (item.parentFolder !== project.rootFolder) continue;
            
            var ext = "";
            var isFolder = (item instanceof FolderItem);

            if (isFolder) {
                var lowerName = item.name.toLowerCase();
                if (lowerName.slice(-4) === ".aep" || lowerName.slice(-5) === ".aepx") ext = "dl";
                else continue; 
            } else if (item instanceof FootageItem) {
                if (item.mainSource instanceof SolidSource) continue; 
                if (item.mainSource instanceof PlaceholderSource) continue;
                try {
                    var parts = item.name.split('.');
                    if (parts.length > 1) ext = parts.pop().toLowerCase();
                } catch(e) {}
            } else if (item instanceof CompItem) {
                if (!isAdjustmentLayerComp(item)) precomps.push(item);
                continue; 
            }

            if (ext !== "") {
                var targetFolder = "";
                
                if (['jpeg', 'jpg', 'png', 'tiff', 'tif', 'psd', 'exr', 'tga', 'webp', 'bmp'].indexOf(ext) !== -1) targetFolder = 'Images';
                else if (['mov', 'mp4', 'mxf', 'avi', 'webm', 'mkv', 'flv', 'r3d', 'braw', 'mts'].indexOf(ext) !== -1) targetFolder = 'Video Files';
                else if (['ai', 'eps', 'pdf', 'svg'].indexOf(ext) !== -1) targetFolder = 'Vector Files';
                else if (['wav', 'mp3', 'aac', 'm4a', 'wma', 'aiff'].indexOf(ext) !== -1) {
                    targetFolder = 'Audio Files';
                    
                    // Epidemic Sound & Audio Sub-sorting Logic
                    var isES = (item.name.indexOf("ES_") === 0);
                    var mediaPath = "";
                    try { if (item.mainSource && item.mainSource.file) mediaPath = item.mainSource.file.fsName; } catch(e){}
                    var pathUpper = mediaPath ? mediaPath.toUpperCase() : "";
                    
                    var hasSFX = (pathUpper.indexOf("\\SFX\\") !== -1 || pathUpper.indexOf("/SFX/") !== -1);
                    var hasMusic = (pathUpper.indexOf("\\MUSIC\\") !== -1 || pathUpper.indexOf("/MUSIC/") !== -1);
                    
                    if (isES || hasSFX || hasMusic) {
                        if (hasSFX || (isES && item.name.toUpperCase().indexOf("SFX") !== -1)) {
                            targetFolder += "/SFX";
                        } else {
                            targetFolder += "/Music";
                        }
                    }
                }
                else if (['glb', 'gltf', 'sbsar', 'obj', 'fbx', 'c4d'].indexOf(ext) !== -1) targetFolder = '3D Models';
                else if (['aep', 'aepx', 'prproj'].indexOf(ext) !== -1) targetFolder = 'Dynamic Link';
                else targetFolder = ext.toUpperCase() + " Files";

                if (!sortGroups[targetFolder]) sortGroups[targetFolder] = [];
                sortGroups[targetFolder].push(item);
            }
        }

        // Execute Moves
        for (var fName in sortGroups) {
            var targetFolderItem = findOrCreateFolderAE(fName); // Поддерживает вложенность "Audio Files/SFX"
            var list = sortGroups[fName];
            for (var j = 0; j < list.length; j++) {
                try {
                    if (list[j].id !== targetFolderItem.id) {
                        list[j].parentFolder = targetFolderItem;
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

        // PHASE 2: AE TEMPLATES DEEP MERGE
        var masterTemplateFolder = null;
        for (var m = 1; m <= items.length; m++) {
            if (items[m] instanceof FolderItem && items[m].name === templatesFolderName && items[m].parentFolder === project.rootFolder) {
                masterTemplateFolder = items[m];
                break;
            }
        }

        var parasites = [];
        for (var p = 1; p <= items.length; p++) {
            var pItem = items[p];
            if (pItem instanceof FolderItem && pItem.parentFolder === project.rootFolder) {
                 if (templateTargetNames.indexOf(pItem.name) !== -1) parasites.push(pItem);
            }
        }

        if (parasites.length > 0) {
            if (!masterTemplateFolder) masterTemplateFolder = project.items.addFolder(templatesFolderName);
            
            for (var t = 0; t < parasites.length; t++) {
                var source = parasites[t];
                var existingSub = null;
                var allItems = project.items; 
                for (var s = 1; s <= allItems.length; s++) {
                    if (allItems[s] instanceof FolderItem && allItems[s].parentFolder === masterTemplateFolder && allItems[s].name === source.name) {
                        existingSub = allItems[s];
                        break;
                    }
                }

                if (existingSub) {
                    mergeFoldersRecursivelyAE(source, existingSub);
                    if (getChildrenAE(source).length === 0) source.remove();
                } else {
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
        return "CRASH AE: " + e.message + " (Line: " + e.line + ")";
    }
}

function mergeFoldersRecursivelyAE(sourceFolder, targetFolder) {
    var children = getChildrenAE(sourceFolder);
    for (var i = 0; i < children.length; i++) {
        var item = children[i];
        if (item instanceof FolderItem) {
            var match = null;
            var targetChildren = getChildrenAE(targetFolder);
            for (var t = 0; t < targetChildren.length; t++) {
                if (targetChildren[t] instanceof FolderItem && targetChildren[t].name === item.name) {
                    match = targetChildren[t];
                    break;
                }
            }
            if (match) {
                mergeFoldersRecursivelyAE(item, match);
                if (getChildrenAE(item).length === 0) item.remove();
            } else {
                item.parentFolder = targetFolder;
            }
        } else {
            item.parentFolder = targetFolder;
        }
    }
}

// =========================================================
// UTILITIES (Upgraded for Path Support)
// =========================================================

// Создает или находит бины по пути (напр. "Audio/SFX")
function findOrCreateBin(parentItem, pathStr) {
    var parts = pathStr.split('/');
    var currentBin = parentItem;
    
    for (var i = 0; i < parts.length; i++) {
        var folderName = parts[i];
        var found = null;
        for (var j = 0; j < currentBin.children.numItems; j++) {
            if (currentBin.children[j].type === 2 && currentBin.children[j].name === folderName) {
                found = currentBin.children[j];
                break;
            }
        }
        if (found) {
            currentBin = found;
        } else {
            currentBin = currentBin.createBin(folderName);
        }
    }
    return currentBin;
}

function findBinInBin(parentBin, name) {
    for (var i = 0; i < parentBin.children.numItems; i++) {
        if (parentBin.children[i].type === 2 && parentBin.children[i].name === name) {
            return parentBin.children[i];
        }
    }
    return null;
}

// Создает или находит папки по пути в AE
function findOrCreateFolderAE(pathStr) {
    var parts = pathStr.split('/');
    var project = app.project;
    var currentParent = project.rootFolder;
    
    for (var i = 0; i < parts.length; i++) {
        var folderName = parts[i];
        var found = null;
        for (var j = 1; j <= project.items.length; j++) {
            var item = project.items[j];
            if (item instanceof FolderItem && item.name === folderName && item.parentFolder === currentParent) {
                found = item;
                break;
            }
        }
        if (found) {
            currentParent = found;
        } else {
            var newFolder = project.items.addFolder(folderName);
            newFolder.parentFolder = currentParent;
            currentParent = newFolder;
        }
    }
    return currentParent;
}

function getChildrenAE(folderItem) {
    var children = [];
    var items = app.project.items;
    for (var i = 1; i <= items.length; i++) {
        if (items[i].parentFolder === folderItem) children.push(items[i]);
    }
    return children;
}

function isAdjustmentLayerComp(comp) {
    if (comp.numLayers === 1) return comp.layer(1).adjustmentLayer;
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