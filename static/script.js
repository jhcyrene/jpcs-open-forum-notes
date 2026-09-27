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
const addModal = document.getElementById("addModalOverlay");
const zoomModal = document.getElementById("zoomModalOverlay");
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

function createNoteElement(note) {
    const wrapper = document.createElement("div");
    wrapper.className = "note-wrapper";
    wrapper.dataset.id = note.id; // Tag it for DOM diffing

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
    const dateString = dateObj.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    const timeString = dateObj.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

    const fullDateString = `${dateString} at ${timeString}`;
    footerDiv.innerHTML = `<i class="fa-regular fa-clock"></i> ${fullDateString}`;

    noteEl.appendChild(textDiv);
    noteEl.appendChild(footerDiv);

    noteEl.addEventListener("click", () => {
        openZoomModal(note.text, bgColor, fontStyle, fullDateString);
    });

    wrapper.appendChild(noteEl);
    return wrapper;
}

function renderNotes(notesData) {
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

    const emptyState = notesContainer.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const existingWrappers = Array.from(notesContainer.children);
    const newIds = notesData.map(n => String(n.id));

    // 1. Remove deleted notes smoothly
    existingWrappers.forEach(wrapper => {
        if (!newIds.includes(wrapper.dataset.id)) {
            wrapper.style.transform = 'scale(0)';
            wrapper.style.opacity = '0';
            setTimeout(() => wrapper.remove(), 400); 
        }
    });

    // 2. Add or move notes
    notesData.forEach((note, index) => {
        let wrapper = notesContainer.querySelector(`.note-wrapper[data-id="${note.id}"]`);

        if (!wrapper) {
            // New Note Insert Animation
            wrapper = createNoteElement(note);
            wrapper.style.opacity = '0';
            wrapper.style.transform = 'scale(0.5) translateY(-30px)';
            
            if (index >= notesContainer.children.length) {
                notesContainer.appendChild(wrapper);
            } else {
                notesContainer.insertBefore(wrapper, notesContainer.children[index]);
            }

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    wrapper.style.opacity = '1';
                    wrapper.style.transform = 'scale(1) translateY(0)';
                });
            });
        } else {
            // Re-order if it was pinned/unpinned
            const currentIndex = Array.from(notesContainer.children).indexOf(wrapper);
            if (currentIndex !== index) {
                if (index >= notesContainer.children.length) {
                    notesContainer.appendChild(wrapper);
                } else {
                    notesContainer.insertBefore(wrapper, notesContainer.children[index]);
                }
            }

            // Update pin border styling dynamically
            const noteEl = wrapper.querySelector('.note');
            if (note.is_pinned) {
                noteEl.classList.add('pinned');
            } else {
                noteEl.classList.remove('pinned');
            }
        }
    });
}

async function loadNotes(isBackgroundPoll = false) {
    try {
        const response = await fetch(`/api/notes?session_id=${sessionId}`, { headers: { "Accept": "application/json" } });
        
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) throw new Error("Server configuration error.");
        if (!response.ok) throw new Error("Failed to load notes.");
        
        const notes = await response.json();
        
        const newState = notes.map(n => n.id + "-" + n.is_pinned).join(",");
        if (currentNotesState === newState) return;
        
        currentNotesState = newState;
        renderNotes(notes);
    } catch (error) {
        if (!isBackgroundPoll) showToast(error.message);
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
            showToast(`Please wait ${COOLDOWN_SECONDS - secondsSinceLastPost} seconds before posting again.`);
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

        if (!response.ok) throw new Error("Could not post note.");
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
    document.getElementById("zoomedDate").innerHTML = `<i class="fa-regular fa-clock"></i> ${dateStr}`;
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
        addModal.classList.remove("active");
        zoomModal.classList.remove("active");
        document.body.classList.remove("modal-open");
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        if (addModal.classList.contains("active")) submitNote();
    }
});

loadNotes();
setInterval(() => loadNotes(true), 3000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") loadNotes(true); });