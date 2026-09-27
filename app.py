import os
import psycopg2
from flask import Flask, render_template, request, jsonify
from markupsafe import escape

app = Flask(__name__)

# Check for both Vercel's default and Neon's default variable names
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
                cursor.execute('ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE')
                
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS visitors (
                        session_id VARCHAR(50) PRIMARY KEY,
                        last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
            return jsonify({"error": "Note exceeds maximum length."}), 400

        note_content = str(escape(note_content)) 

        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute('INSERT INTO notes (content) VALUES (%s)', (note_content,))
            conn.commit()
        return jsonify({"status": "success"}), 201
    
    session_id = request.args.get('session_id')
    
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            if session_id:
                cursor.execute('''
                    INSERT INTO visitors (session_id, last_active) 
                    VALUES (%s, CURRENT_TIMESTAMP) 
                    ON CONFLICT (session_id) 
                    DO UPDATE SET last_active = CURRENT_TIMESTAMP
                ''', (session_id,))
            
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
                
            cursor.execute('''
                SELECT COUNT(*) FROM visitors 
                WHERE last_active >= CURRENT_TIMESTAMP - INTERVAL '15 seconds'
            ''')
            online_count = cursor.fetchone()[0]
            
        conn.commit() 

    response = jsonify(notes)
    response.headers['X-Online-Count'] = str(online_count)
    return response

@app.route('/api/notes/<int:note_id>', methods=['DELETE'])
def delete_note(note_id):
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('DELETE FROM notes WHERE id = %s', (note_id,))
        conn.commit()
    return jsonify({"status": "deleted"}), 200

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