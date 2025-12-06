import os
import google.genai as genai

from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS

prompt = """
Take the given paragraph and explain its key points in very simple language.   
Make it easy to read for people with dyslexia.  
Do not include any keys in the JSON—just output the content as a plain string.
Ensure that each point is gramatically correct as its own sentence.
You must check your own response before output, ensuring that it follows the required format.
If not, retry.
Also, ensure the text is extremely concise.
For example, instead of: Someone is closing down a place, but it opens again right away,
Write: A place is closing down and reopening.
This is the following json format you must follow:
{"1":"sentence1","2":"sentence2","3":"sentence3"}
Ensure that the response starts with { and ends with }. If it does not, make sure to correct it.
Write in sentences which end in a period.
The paragraph is below:
"""

app = Flask(__name__)
CORS(app)

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key)

@app.route('/summarise', methods=['GET'])
def api():
    # Get query parameters
    paragraph = request.args.get('text', 'empty')
    
    responseAI = client.models.generate_content(
        model="gemini-2.5-flash-lite",
        contents=f"{prompt}\n{paragraph}"
    )

    text = responseAI.text

    # Return a JSON object with a `content` field so callers can parse it reliably
    return jsonify(text)

if __name__ == '__main__':
    app.run(debug=True)