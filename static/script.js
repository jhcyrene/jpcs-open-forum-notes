const colors = [
    // Classic Note Pastels
    "#fdf39b", "#fbcfe8", "#bfdbfe", "#bbf7d0", "#e9d5ff",
    
    // Soft & Faded Warm Tones
    "#ffb3ba", "#ffdfba", "#ffd3b6", "#ffaaa5", "#fadbd8", 
    "#e6b0aa", "#f5cba7", "#fca5a5", "#fde08b", "#f9e79f",
    
    // Soft & Faded Cool Tones
    "#baffc9", "#bae1ff", "#a8e6cf", "#d6eaf8", "#d5f5e3", 
    "#a2d9ce", "#a9cce3", "#d4efdf", "#b5e7a0", "#93c5fd",
    
    // Soft & Faded Purples / Lilacs
    "#e2cbff", "#e8daef", "#ebdef0", "#d7bde2", "#c3aed6",

    // --- NEW: Intense & Vibrant Colors ---
    "#fbbf24", // Amber Gold
    "#f97316", // Vivid Orange
    "#ef4444", // Bright Red
    "#ec4899", // Hot Pink
    "#d946ef", // Fuchsia
    "#8b5cf6", // Vivid Violet
    "#3b82f6", // Bright Blue
    "#0ea5e9", // Vivid Sky
    "#06b6d4", // Electric Cyan
    "#10b981", // Emerald Green
    "#84cc16"  // Lime Green
];

const decorations = ["tape-center", "pin", "tape-corner", "washi"];
const fonts = [
    "'Caveat', cursive", 
    "'Shadows Into Light', cursive", 
    "'Architects Daughter', cursive"
];

const notesContainer = document.getElementById("notesContainer");
const addModal = document.getElementById("addModalOverlay");
const zoomModal = document.getElementById("zoomModalOverlay");
const textarea = document.getElementById("newNoteContent");
const submitBtn = document.getElementById("submitBtn");
const submitSpinner = document.getElementById("submitSpinner");

const COOLDOWN_SECONDS = 2; 
let currentNotesState = null; 

// Generates a consistent "random" number based on the note's unique ID
function getPseudoRandom(seed, max) {
    const randomNum = Math.abs(Math.sin(seed * 12.9898) * 43758.5453);
    return Math.floor(randomNum % max);
}

function renderNotes(notesData) {
    notesContainer.innerHTML = "";

    if (!notesData || !notesData.length) {
        notesContainer.innerHTML = `
            <div class="empty-state">
                <i class="fa-regular fa-note-sticky"></i>
                No thoughts yet.<br>
                Be the first to leave one.
            </div>
        `;
        return;
    }

    notesData.forEach((note, index) => {
        const wrapper = document.createElement("div");
        wrapper.className = "note-wrapper";
        wrapper.style.animationDelay = `${index * 0.04}s`;

// Uses the ID as a seed to pick completely random colors, fonts, and decorations
        const bgColor = colors[getPseudoRandom(note.id, colors.length)];
        const decoClass = decorations[getPseudoRandom(note.id + 10, decorations.length)];
        const fontStyle = fonts[getPseudoRandom(note.id + 20, fonts.length)];

        const noteEl = document.createElement("div");
        noteEl.className = `note ${decoClass}`;
        noteEl.style.backgroundColor = bgColor;
        
        // Generates a random rotation between -2.5 and 2.5 degrees
        const rotation = (getPseudoRandom(note.id + 30, 50) / 10) - 2.5;
        noteEl.style.transform = `rotate(${rotation}deg)`;
        
        noteEl.style.fontFamily = fontStyle; 
        if (fontStyle.includes("Caveat")) noteEl.style.fontSize = "24px";
        if (fontStyle.includes("Shadows")) noteEl.style.fontSize = "21px";
        if (fontStyle.includes("Architects")) noteEl.style.fontSize = "18px";

        const textDiv = document.createElement("div");
        textDiv.className = "note-content";
        textDiv.textContent = note.text; 

        const footerDiv = document.createElement("div");
        footerDiv.className = "note-footer";
        footerDiv.style.fontFamily = "'Inter', sans-serif"; 

        const dateObj = new Date(note.timestamp);
        const dateString = dateObj.toLocaleDateString(undefined, {
            month: "short", day: "numeric", year: "numeric"
        });
        const timeString = dateObj.toLocaleTimeString(undefined, {
            hour: "2-digit", minute: "2-digit"
        });

        const fullDateString = `${dateString} at ${timeString}`;

        footerDiv.innerHTML = `<i class="fa-regular fa-clock"></i> ${fullDateString}`;

        noteEl.appendChild(textDiv);
        noteEl.appendChild(footerDiv);

        noteEl.addEventListener("click", () => {
            openZoomModal(note.text, bgColor, fontStyle, fullDateString);
        });

        wrapper.appendChild(noteEl);
        notesContainer.appendChild(wrapper);
    });
}

// --- UPDATED: loadNotes now checks the state ---
async function loadNotes(isBackgroundPoll = false) {
    try {
        const response = await fetch("/api/notes", {
            headers: { "Accept": "application/json" }
        });

        if (!response.ok) throw new Error("Failed to load notes.");

        const notes = await response.json();
        
        // Check if the board actually changed before re-rendering
        const newState = notes.map(n => n.id).join(",");
        if (currentNotesState === newState) return;
        
        currentNotesState = newState;
        renderNotes(notes);
    } catch (error) {
        if (!isBackgroundPoll) {
            notesContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    Unable to load thoughts.<br>
                    Please refresh the page.
                </div>
            `;
            showToast("Could not load notes.");
        }
    }
}

function openAddModal() {
    addModal.classList.add("active");
    setTimeout(() => textarea.focus(), 100);
}

function closeAddModal(event) {
    if (event && event.type === 'click' && event.target !== addModal && !event.target.classList.contains('btn-cancel')) return;
    addModal.classList.remove("active");
    textarea.value = "";
    updateCharCount();
    resetButtonState();
}

function resetButtonState() {
    submitBtn.disabled = false;
    textarea.disabled = false;
    submitBtn.querySelector('span').textContent = "Post Anonymously";
    submitSpinner.style.display = "none";
}

async function submitNote() {
    const text = textarea.value.trim();

    if (!text) {
        textarea.focus();
        showToast("Write something first.");
        return;
    }

    const lastPostTime = localStorage.getItem('lastPostTime');
    if (lastPostTime) {
        const secondsSinceLastPost = Math.floor((Date.now() - parseInt(lastPostTime)) / 1000);
        if (secondsSinceLastPost < COOLDOWN_SECONDS) {
            const waitTime = COOLDOWN_SECONDS - secondsSinceLastPost;
            showToast(`Please wait ${waitTime} seconds before posting again.`);
            return;
        }
    }

    submitBtn.disabled = true;
    textarea.disabled = true;
    submitBtn.querySelector('span').textContent = "Posting...";
    submitSpinner.style.display = "inline-block";

    try {
        const response = await fetch("/api/notes", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({ text: text }) 
        });

        const result = await response.json();

        if (!response.ok) throw new Error(result.error || "Could not post note.");

        localStorage.setItem('lastPostTime', Date.now().toString());

        closeAddModal();
        // We do NOT need to call loadNotes() manually here anymore, because the SSE listener will trigger it automatically!
        showToast("Posted anonymously.");
    } catch (error) {
        showToast(error.message);
        resetButtonState(); // Only reset if there was an error, otherwise modal closes
    } 
}

function openZoomModal(text, color, font, dateStr) {
    const zoomedTextEl = document.getElementById("zoomedText");
    zoomedTextEl.textContent = text;
    
    zoomedTextEl.style.fontFamily = font;
    if (font.includes("Caveat")) zoomedTextEl.style.fontSize = "38px";
    if (font.includes("Shadows")) zoomedTextEl.style.fontSize = "32px";
    if (font.includes("Architects")) zoomedTextEl.style.fontSize = "26px";

    document.getElementById("zoomedNote").style.backgroundColor = color;
    document.getElementById("zoomedDate").innerHTML = `<i class="fa-regular fa-clock"></i> ${dateStr}`;

    zoomModal.classList.add("active");
}

function closeZoomModal(event) {
    if (event && event.target !== zoomModal && !event.target.classList.contains("zoom-close")) {
        return;
    }
    zoomModal.classList.remove("active");
}

function updateCharCount() {
    document.getElementById("charCount").textContent = `${textarea.value.length} / 1000`;
}

function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        addModal.classList.remove("active");
        zoomModal.classList.remove("active");
    }

    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        if (addModal.classList.contains("active")) {
            submitNote();
        }
    }
});

// Load immediately on open
loadNotes();

// Poll the server quietly every 5 seconds
setInterval(() => loadNotes(true), 3000);

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        loadNotes(true); 
    }
});