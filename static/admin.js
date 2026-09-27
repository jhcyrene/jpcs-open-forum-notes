const colors = ["#fdf39b", "#fbcfe8", "#bfdbfe", "#bbf7d0", "#e9d5ff"];
const decorations = ["tape-center", "pin", "tape-corner", "washi"];
const fonts = ["'Caveat', cursive", "'Shadows Into Light', cursive", "'Architects Daughter', cursive"];

const notesContainer = document.getElementById("notesContainer");
const zoomModal = document.getElementById("zoomModalOverlay");

// Added elements for the Add Note feature
const addModal = document.getElementById("addModalOverlay");
const textarea = document.getElementById("newNoteContent");
const submitBtn = document.getElementById("submitBtn");
const submitSpinner = document.getElementById("submitSpinner");

const COOLDOWN_SECONDS = 15;
let currentNotesState = null; // Tracks the current board state

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
                Board is empty.
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
        const fullDateString = `${dateObj.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} at ${dateObj.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;

        footerDiv.innerHTML = `<i class="fa-regular fa-clock"></i> ${fullDateString}`;

        // Admin Delete Button
        const deleteBtn = document.createElement("div");
        deleteBtn.className = "delete-btn";
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
        deleteBtn.onclick = (e) => {
            e.stopPropagation(); 
            if (confirm("Are you sure you want to delete this note?")) {
                deleteNote(note.id);
            }
        };

        noteEl.appendChild(deleteBtn);
        noteEl.appendChild(textDiv);
        noteEl.appendChild(footerDiv);

        noteEl.addEventListener("click", () => {
            openZoomModal(note.text, bgColor, fontStyle, fullDateString);
        });

        wrapper.appendChild(noteEl);
        notesContainer.appendChild(wrapper);
    });
}

async function deleteNote(id) {
    try {
        const response = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error("Failed to delete note.");
        showToast("Note deleted successfully.");
        // We do NOT need to call loadNotes() here anymore, because the SSE listener will trigger it automatically!
    } catch (error) {
        showToast(error.message);
    }
}

async function loadNotes(isBackgroundPoll = false) {
    try {
        const response = await fetch("/api/notes", { headers: { "Accept": "application/json" } });
        if (!response.ok) throw new Error("Failed to load notes.");
        
        const notes = await response.json();
        
        // Check if the board actually changed before re-rendering
        const newState = notes.map(n => n.id).join(",");
        if (currentNotesState === newState) return;
        
        currentNotesState = newState;
        renderNotes(notes);
    } catch (error) {
        if (!isBackgroundPoll) {
            showToast("Could not load notes.");
        }
    }
}

// --- ADD POST LOGIC ---
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
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ text: text }) 
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not post note.");

        localStorage.setItem('lastPostTime', Date.now().toString());

        closeAddModal();
        showToast("Posted anonymously.");
    } catch (error) {
        showToast(error.message);
        resetButtonState();
    } 
}

function updateCharCount() {
    document.getElementById("charCount").textContent = `${textarea.value.length} / 1000`;
}

// --- ZOOM MODAL LOGIC ---
function openZoomModal(text, color, font, dateStr) {
    const zoomedTextEl = document.getElementById("zoomedText");
    zoomedTextEl.textContent = text;
    zoomedTextEl.style.fontFamily = font;
    if (font.includes("Caveat")) zoomedTextEl.style.fontSize = "38px";
    if (font.includes("Shadows")) zoomedTextEl.style.fontSize = "32px";
    if (font.includes("Architects")) zoomedTextEl.style.fontSize = "26px";

    document.getElementById("zoomedNote").style.backgroundColor = color;
    
    // Safely apply the date to the zoom modal
    const dateEl = document.getElementById("zoomedDate");
    if (dateEl) {
        dateEl.innerHTML = `<i class="fa-regular fa-clock"></i> ${dateStr}`;
    }
    
    zoomModal.classList.add("active");
}

function closeZoomModal(event) {
    if (event && event.target !== zoomModal && !event.target.classList.contains("zoom-close")) return;
    zoomModal.classList.remove("active");
}

function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => { toast.classList.remove("show"); }, 2500);
}

// --- EVENT LISTENERS ---
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        if (addModal) addModal.classList.remove("active");
        zoomModal.classList.remove("active");
    }

    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        if (addModal && addModal.classList.contains("active")) {
            submitNote();
        }
    }
});

// Load immediately on open
loadNotes();

// Poll the server quietly every 5 seconds
setInterval(() => loadNotes(true), 5000);

// Instantly fetch missed notes if the user switches tabs and comes back
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        loadNotes(true); 
    }
});