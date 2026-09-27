import os
import psycopg2
from flask import Flask, render_template, request, jsonify
from markupsafe import escape

app = Flask(__name__)

# Vercel automatically provides this when you create a Postgres database in their dashboard
DB_URL = os.environ.get('POSTGRES_URL')

def get_db_connection():
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
            return jsonify({"error": "Note exceeds maximum length of 1000 characters."}), 400

        note_content = str(escape(note_content)) 

        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute('INSERT INTO notes (content) VALUES (%s)', (note_content,))
            conn.commit()
            
        return jsonify({"status": "success"}), 201
    
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('SELECT id, content, created_at FROM notes ORDER BY id DESC')
            
            notes = []
            for row in cursor.fetchall():
                timestamp_iso = row[2].isoformat() + "Z" if row[2] else ""
                notes.append({
                    "id": row[0], 
                    "text": row[1], 
                    "timestamp": timestamp_iso
                })
            
    return jsonify(notes)

@app.route('/api/notes/<int:note_id>', methods=['DELETE'])
def delete_note(note_id):
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('DELETE FROM notes WHERE id = %s', (note_id,))
        conn.commit()
        
    return jsonify({"status": "deleted"}), 200

if __name__ == '__main__':
    app.run(debug=True)