from pathlib import Path
path = Path(r"C:\\Users\\User\\relay\\packages\\relay-log-uploader\\popup.css")
text = path.read_text(encoding="utf-8")
# Ensure summary style has flex layout
text = text.replace(
    """.prompt-card summary {\n  list-style: none;\n  cursor: pointer;\n  font-size: 11px;\n  text-transform: uppercase;\n  letter-spacing: 0.1em;\n  color: var(--muted);\n}\n\n.prompt-card summary::-webkit-details-marker {\n  display: none;\n}\n\n.prompt-card summary::after {\n  content: \"â–¾\";\n  float: right;\n  color: var(--muted);\n}\n\n.prompt-card[open] summary::after {\n  content: \"â–´\";\n}\n""",
    """.prompt-card summary {\n  list-style: none;\n  cursor: pointer;\n  font-size: 11px;\n  text-transform: uppercase;\n  letter-spacing: 0.1em;\n  color: var(--muted);\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n}\n\n.prompt-card summary::-webkit-details-marker {\n  display: none;\n}\n\n.prompt-summary__meta {\n  font-size: 10px;\n  letter-spacing: 0.16em;\n  color: var(--accent-bright);\n}\n\n.prompt-card summary::after {\n  content: \"\";\n}\n\n.prompt-card summary span:last-child::after {\n  content: \" v\";\n  margin-left: 6px;\n  color: var(--muted);\n}\n\n.prompt-card[open] summary span:last-child::after {\n  content: \" ^\";\n}\n"""
)
if "prompt-summary__meta" not in text:
    raise SystemExit("failed to update summary block")
if "button.small" not in text:
    text = text + "\nbutton.small {\n  font-size: 10px;\n  padding: 6px 10px;\n  letter-spacing: 0.12em;\n}\n"
path.write_text(text, encoding="utf-8")
