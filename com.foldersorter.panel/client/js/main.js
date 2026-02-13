(function () {
    'use strict';
    
    var csInterface = new CSInterface();
    
    // --- LINKS ---
    var LINKS = {
        developer: "https://fareeditor.crd.co",
        source: "https://github.com/Fare7731/adobe-folder-sorter"
    };

    var IS_DEBUG = true; 

    // --- DOM ELEMENTS ---
    var statusDiv = document.getElementById('status');
    var sortBtn = document.getElementById('sortBtn');

    // --- LOGGER ---
    if (IS_DEBUG) {
        csInterface.addEventListener("com.foldersorter.debug", function(event) {
            console.log("%c[JSX]", "color: #bada55", event.data);
        });
    }

    // --- HELPER: SET STATUS ---
    function setStatus(text, type) {
        statusDiv.innerText = text;
        statusDiv.className = ""; // Reset classes
        
        if (type === "process") statusDiv.classList.add("status-process");
        else if (type === "success") statusDiv.classList.add("status-success");
        else if (type === "error") statusDiv.classList.add("status-error");
        else statusDiv.classList.add("status-ready");
    }

    // --- 1. SORT BUTTON ---
    sortBtn.addEventListener('click', function () {
        setStatus("Processing...", "process");
        
        csInterface.evalScript('runSorter()', function(result) {
            if (IS_DEBUG) console.log("[UI] Result:", result);
            
            if (!result) {
                setStatus("Unknown Error", "error");
                return;
            }

            // CHECK FOR ERRORS
            if (result.indexOf("CRASH") !== -1 || result.indexOf("ERROR") !== -1) {
                setStatus(result, "error");
            }
            // CHECK FOR "NOTHING TO DO"
            else if (result.indexOf("No files") !== -1 || result.indexOf("Nothing") !== -1) {
                setStatus("No files to sort", "error");
            }
            // SUCCESS
            else {
                setStatus(result, "success");
            }

            // Auto-reset after 5 seconds
            setTimeout(function() {
                if (statusDiv.innerText === result) { 
                    setStatus("Ready", "ready");
                }
            }, 5000);
        });
    });

    // --- 2. FOOTER LINKS ---
    document.getElementById('devBtn').addEventListener('click', function() {
        csInterface.openURLInDefaultBrowser(LINKS.developer);
    });

    document.getElementById('codeBtn').addEventListener('click', function() {
        csInterface.openURLInDefaultBrowser(LINKS.source);
    });
    
}());