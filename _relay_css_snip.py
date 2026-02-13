from pathlib import Path
text = Path(r"C:\\Users\\User\\relay\\packages\\relay-log-uploader\\popup.css").read_text(encoding="utf-8")
start = text.find(".prompt-card summary")
snippet = text[start:start+400]
print(repr(snippet))
