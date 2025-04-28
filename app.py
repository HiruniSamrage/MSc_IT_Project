from flask import Flask, request, jsonify, render_template, session
from flask_cors import CORS
import openai
import os
import faiss
import pickle
import numpy as np
import sqlite3
import time
import traceback
from langdetect import detect
from deep_translator import GoogleTranslator

def detect_and_translate(text):
    try:
        lang = detect(text)
        if lang != 'en':
            text = GoogleTranslator(source='auto', target='en').translate(text)
    except:
        pass
    return text


app = Flask(__name__)
CORS(app)
app.secret_key = 'API_secret_key'

# Load OpenAI API key
openai.api_key = os.getenv or "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"

# Load FAISS index + knowledge
print("Loading vector DB and knowledge base...")
rag_index = faiss.read_index("rag_vector.index")
with open("rag_knowledge.pkl", "rb") as f:
    rag_knowledge = pickle.load(f)

# Embedding generator
def get_embedding(text):
    response = openai.Embedding.create(
        model="text-embedding-3-small",
        input=text
    )
    return np.array([response["data"][0]["embedding"]])

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/about")
def about():
    return render_template("about.html")

@app.route("/courses")
def courses():
    return render_template("courses.html")

@app.route("/contact")
def contact():
    return render_template("contact.html")


@app.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    name = data.get("name")
    email = data.get("email")
    contact = data.get("contact")

    with sqlite3.connect("users.db", check_same_thread=False) as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
        row = cursor.fetchone()

        if row:
            user_id = row[0]
        else:
            cursor.execute("INSERT INTO users (name, email, contact) VALUES (?, ?, ?)", (name, email, contact))
            conn.commit()
            user_id = cursor.lastrowid

    session["user_id"] = user_id
    session["user_name"] = name

    return jsonify({"status": "success", "name": name, "email": email})

@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json()
    email = data.get("email")
    user_message = detect_and_translate(data.get("message"))

    with sqlite3.connect("users.db", check_same_thread=False) as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
        row = cursor.fetchone()

        if not row:
            return jsonify({"response": "⚠️ User not found. Please login again."})
        user_id = row[0]     
    
    user_embedding = get_embedding(user_message)
    distances, indices = rag_index.search(user_embedding, 5)
    retrieved_chunks = [rag_knowledge[i]["content"] for i in indices[0]]

    system_prompt = (
    "You are Campy – the official virtual assistant of the Institute of Innovative Technologies (IIT). "
    "You must only answer based on the provided information below. "
    "If you cannot find the answer within this information, you must reply: "
    "'I'm sorry, I can't help you with that information. Please contact the Institute for further assistance via the hotline number: +94 766 760 760 or email at info@iit.ac.lk.'\n\n"
    "Here is the information you can use:\n\n"
    + "\n\n".join(retrieved_chunks)
)


    chat_history = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message}
    ]

    try:
        response = openai.ChatCompletion.create(
            model="gpt-4o",
            messages=chat_history
        )
        bot_reply = response["choices"][0]["message"]["content"]

        # --- Retry logic for database locking ---
        for attempt in range(5):
            try:
                with sqlite3.connect("users.db", timeout=10, check_same_thread=False) as conn:
                    conn.execute("PRAGMA journal_mode=WAL;")
                    cursor = conn.cursor()
                    cursor.execute("INSERT INTO chat_history (user_id, sender, message) VALUES (?, ?, ?)",
                                   (user_id, "user", user_message))
                    cursor.execute("INSERT INTO chat_history (user_id, sender, message) VALUES (?, ?, ?)",
                                   (user_id, "bot", bot_reply))
                    conn.commit()
                break
            except sqlite3.OperationalError as e:
                if "database is locked" in str(e).lower():
                    print(f"⚠️ DB is locked, retrying {attempt + 1}/5...")
                    time.sleep(1)
                else:
                    raise

        return jsonify({"response": bot_reply})

    except Exception as e:
        error_message = traceback.format_exc()
        print("🔥 Error occurred:\n", error_message)
        return jsonify({"response": f"Oops! Something went wrong.\n\n{str(e)}"})

@app.route("/history-data")
def history_data():
    email = request.args.get("email")
    with sqlite3.connect("users.db", check_same_thread=False) as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
        row = cursor.fetchone()

        if not row:
            return jsonify([])
        
        user_id = row[0]

    with sqlite3.connect("users.db", check_same_thread=False) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT sender, message, timestamp FROM chat_history WHERE user_id = ? ORDER BY timestamp ASC", (user_id,))
        rows = cursor.fetchall()

    history = [{"sender": row[0], "message": row[1], "timestamp": row[2]} for row in rows]
    return jsonify(history)

@app.route("/feedback", methods=["POST"])
def feedback():
    if "user_id" not in session:
        return jsonify({"status": "error", "message": "Not logged in"}), 403

    user_id = session["user_id"]
    feedback_type = request.json.get("type")

    with sqlite3.connect("users.db", check_same_thread=False) as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO feedback (user_id, type) VALUES (?, ?)", (user_id, feedback_type))
        conn.commit()

    return jsonify({"status": "success"})


if __name__ == "__main__":
    app.run(debug=True, threaded=False)
