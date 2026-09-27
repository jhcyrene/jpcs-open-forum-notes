import os
import psycopg2
from flask import Flask, render_template, request, jsonify
from markupsafe import escape

app = Flask(__name__)

DB_URL = os.environ.get('POSTGRES_URL') or os.environ.get('DATABASE_URL')

def get_db_connection():
    if not DB_URL:
        raise ValueError("Database URL is missing! Check Vercel environment variables.")
    return psycopg2.connect(DB_URL)

def init_db():
    if not DB_URL:
        return
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS notes (
                        id SERIAL PRIMARY KEY,
                        content TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                ''')
                # Safely add the column if it doesn't exist yet
                cursor.execute('ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE')
            conn.commit()
    except Exception as e:
        print("Database not initialized:", e)

init_db()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/main-control')
def main_control():
    return render_template('admin.html')

@app.route('/api/notes', methods=['GET', 'POST'])
def api_notes():
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        note_content = data.get('text', '').strip()
        
        if not note_content:
            return jsonify({"error": "Note content is required"}), 400
        if len(note_content) > 1000:
            return jsonify({"error": "Note exceeds maximum length."}), 400

        note_content = str(escape(note_content)) 

        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute('INSERT INTO notes (content) VALUES (%s)', (note_content,))
            conn.commit()
        return jsonify({"status": "success"}), 201
    
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            # Sort by pinned first, then by newest
            cursor.execute('SELECT id, content, created_at, is_pinned FROM notes ORDER BY is_pinned DESC, id DESC')
            notes = []
            for row in cursor.fetchall():
                timestamp_iso = row[2].isoformat() + "Z" if row[2] else ""
                notes.append({
                    "id": row[0], 
                    "text": row[1], 
                    "timestamp": timestamp_iso,
                    "is_pinned": bool(row[3])
                })
    return jsonify(notes)

@app.route('/api/notes/<int:note_id>', methods=['DELETE'])
def delete_note(note_id):
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('DELETE FROM notes WHERE id = %s', (note_id,))
        conn.commit()
    return jsonify({"status": "deleted"}), 200

# NEW ROUTE: Toggle Pin Status
@app.route('/api/notes/<int:note_id>/pin', methods=['PATCH'])
def toggle_pin(note_id):
    data = request.get_json(silent=True) or {}
    pin_status = data.get('is_pinned', True)
    
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('UPDATE notes SET is_pinned = %s WHERE id = %s', (pin_status, note_id))
        conn.commit()
    return jsonify({"status": "updated"}), 200

if __name__ == '__main__':
    app.run(debug=True)