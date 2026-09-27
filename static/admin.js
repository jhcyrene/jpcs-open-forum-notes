const colors = [
    "#fdf39b", "#fbcfe8", "#bfdbfe", "#bbf7d0", "#e9d5ff",
    "#ffb3ba", "#ffdfba", "#ffd3b6", "#ffaaa5", "#fadbd8", 
    "#e6b0aa", "#f5cba7", "#fca5a5", "#fde08b", "#f9e79f",
    "#baffc9", "#bae1ff", "#a8e6cf", "#d6eaf8", "#d5f5e3", 
    "#a2d9ce", "#a9cce3", "#d4efdf", "#b5e7a0", "#93c5fd",
    "#e2cbff", "#e8daef", "#ebdef0", "#d7bde2", "#c3aed6",
    "#fbbf24", "#f97316", "#ef4444", "#ec4899", "#d946ef",
    "#8b5cf6", "#3b82f6", "#0ea5e9", "#06b6d4", "#10b981", "#84cc16"
];

const decorations = ["tape-center", "pin", "tape-corner", "washi"];
const fonts = [
    "'Caveat', cursive", 
    "'Shadows Into Light', cursive", 
    "'Architects Daughter', cursive"
];

const notesContainer = document.getElementById("notesContainer");
const zoomModal = document.getElementById("zoomModalOverlay");
const addModal = document.getElementById("addModalOverlay");
const textarea = document.getElementById("newNoteContent");
const submitBtn = document.getElementById("submitBtn");
const submitSpinner = document.getElementById("submitSpinner");

const COOLDOWN_SECONDS = 2;
let currentNotesState = null; 

let sessionId = sessionStorage.getItem('notevoid_session');
if (!sessionId) {
    sessionId = Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem('notevoid_session', sessionId);
}

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

        const bgColor = colors[getPseudoRandom(note.id, colors.length)];
        const decoClass = decorations[getPseudoRandom(note.id + 10, decorations.length)];
        const fontStyle = fonts[getPseudoRandom(note.id + 20, fonts.length)];

        const noteEl = document.createElement("div");
        noteEl.className = `note ${decoClass} ${note.is_pinned ? 'pinned' : ''}`;
        noteEl.style.backgroundColor = bgColor;
        
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

        const pinBtn = document.createElement("div");
        pinBtn.className = `pin-btn ${note.is_pinned ? 'active' : ''}`;
        pinBtn.innerHTML = note.is_pinned ? '<i class="fa-solid fa-thumbtack"></i>' : '<i class="fa-solid fa-thumbtack" style="opacity: 0.5;"></i>';
        pinBtn.onclick = (e) => {
            e.stopPropagation(); 
            togglePin(note.id, !note.is_pinned);
        };

        const deleteBtn = document.createElement("div");
        deleteBtn.className = "delete-btn";
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
        deleteBtn.onclick = (e) => {
            e.stopPropagation(); 
            if (confirm("Are you sure you want to delete this note?")) {
                deleteNote(note.id);
            }
        };

        noteEl.appendChild(pinBtn);
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
        
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error("Server error. Check Vercel logs.");
        }

        if (!response.ok) throw new Error("Failed to delete note.");
        
        showToast("Note deleted successfully.");
        loadNotes(); 
    } catch (error) {
        showToast(error.message);
    }
}

async function togglePin(id, pinStatus) {
    try {
        const response = await fetch(`/api/notes/${id}/pin`, {
            method: 'PATCH',
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ is_pinned: pinStatus })
        });
        
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error("Server error. Check Vercel database setup.");
        }

        if (!response.ok) throw new Error("Failed to update pin status.");
        
        showToast(pinStatus ? "Note pinned to top." : "Note unpinned.");
        loadNotes(); 
    } catch (error) {
        showToast(error.message);
    }
}

async function loadNotes(isBackgroundPoll = false) {
    try {
        const response = await fetch(`/api/notes?session_id=${sessionId}`, { 
            headers: { "Accept": "application/json" } 
        });
        
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error("Server configuration error (Check Vercel logs).");
        }

        if (!response.ok) throw new Error("Failed to load notes.");

        const onlineCount = response.headers.get("X-Online-Count");
        const onlineCountText = document.getElementById('onlineCountText');
        if (onlineCountText && onlineCount !== null) {
            onlineCountText.textContent = `${onlineCount} Online`;
        }
        
        const notes = await response.json();
        
        const newState = notes.map(n => n.id + "-" + n.is_pinned).join(",");
        if (currentNotesState === newState) return;
        
        currentNotesState = newState;
        renderNotes(notes);
    } catch (error) {
        if (!isBackgroundPoll) {
            showToast(error.message);
        }
    }
}

function openAddModal() {
    addModal.classList.add("active");
    document.body.classList.add("modal-open");
    setTimeout(() => textarea.focus(), 50);
}

function closeAddModal(event) {
    if (event && event.type === 'click' && event.target !== addModal && !event.target.classList.contains('btn-cancel')) return;
    
    addModal.classList.remove("active");
    document.body.classList.remove("modal-open");
    
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

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error("Server error. Check Vercel database setup.");
        }

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not post note.");

        localStorage.setItem('lastPostTime', Date.now().toString());

        closeAddModal();
        showToast("Posted anonymously.");
        loadNotes(); 
    } catch (error) {
        showToast(error.message);
        resetButtonState();
    } 
}

function updateCharCount() {
    document.getElementById("charCount").textContent = `${textarea.value.length} / 1000`;
}

function openZoomModal(text, color, font, dateStr) {
    const zoomedTextEl = document.getElementById("zoomedText");
    zoomedTextEl.textContent = text;
    zoomedTextEl.style.fontFamily = font;
    if (font.includes("Caveat")) zoomedTextEl.style.fontSize = "38px";
    if (font.includes("Shadows")) zoomedTextEl.style.fontSize = "32px";
    if (font.includes("Architects")) zoomedTextEl.style.fontSize = "26px";

    document.getElementById("zoomedNote").style.backgroundColor = color;
    
    const dateEl = document.getElementById("zoomedDate");
    if (dateEl) {
        dateEl.innerHTML = `<i class="fa-regular fa-clock"></i> ${dateStr}`;
    }
    
    zoomModal.classList.add("active");
    document.body.classList.add("modal-open");
}

function closeZoomModal(event) {
    if (event && event.target !== zoomModal && !event.target.classList.contains("zoom-close")) return;
    
    zoomModal.classList.remove("active");
    document.body.classList.remove("modal-open");
}

function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => { toast.classList.remove("show"); }, 2500);
}

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        if (addModal) addModal.classList.remove("active");
        if (zoomModal) zoomModal.classList.remove("active");
        document.body.classList.remove("modal-open");
    }

    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        if (addModal && addModal.classList.contains("active")) {
            submitNote();
        }
    }
});

loadNotes();

setInterval(() => loadNotes(true), 3000);

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        loadNotes(true); 
    }
});