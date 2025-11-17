# commitcoach/llm_client.py
import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def ask_commitcoach(system_prompt: str, user_input: str) -> str:
    response = client.responses.create(
        model="gpt-4.1-mini",
        input=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_input},
        ],
        temperature=0,
        text={
            "format": {
                "type": "json_schema",
                "name": "commitcoach_response",
                "strict": True,
                "schema": {
                    "type": "object",
                    "additionalProperties": False,  # 👈 obligatorio con strict
                    "properties": {
                        "commitScore": {
                            "type": "object",
                            "additionalProperties": False,  # 👈 idem aquí
                            "properties": {
                                "value": {"type": "integer"},
                                "label": {
                                    "type": "string",
                                    "enum": ["Green", "Yellow", "Red"]
                                },
                            },
                            "required": ["value", "label"]
                        },
                        "flags": {
                            "type": "array",
                            "items": {"type": "string"}
                        },
                        "suggestions": {
                            "type": "array",
                            "items": {"type": "string"}
                        },
                        "suggestedMessage": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "commitScore",
                        "flags",
                        "suggestions",
                        "suggestedMessage"
                    ]
                }
            }
        },
    )

    return response.output[0].content[0].text
