

```mermaid
flowchart TD
    USER["👤 Treasury User<br><small>Web or Mobile App</small>"]
    GW["🌐 Gateway<br><small>Real-time Connection</small>"]
    DB[("📝 Database<br><small>Bank Balances, Supplier Data, Payment History</small>")]
    SUP["🧠 Supervisor Agent<br><small>Understands intent, breaks down the request</small>"]
    TA["📊 Treasury Analysis Agent<br><small>Checks cashflow, risk, payment safety, split logic</small>"]
    SYN["✍️ Synthesis Agent<br><small>Writes clear, conversational advice, tracks confirmation</small>"]
    SCHED["📅 Scheduler<br><small>Keeps track of scheduled payments & reminders</small>"]

    USER -->|"asks payment/cashflow question (e.g. ‘Can I pay £750k today?’)"| GW
    GW -->|"fetches all relevant data"| DB
    DB -->|"profile, balances, supplier commitments, history"| SUP
    SUP -->|"figures out what’s needed (analysis, simulation, etc.)"| TA
    TA -->|"calculates risk, suggests safe options (e.g. split, defer, proceed)"| SYN
    SYN -->|"writes a plain-English answer, gives options"| USER
    USER -->|"confirms in any words (e.g. ‘yes, go ahead’, ‘schedule it’)"| SYN
    SYN -->|"detects confirmation, schedules payment, responds clearly"| SCHED
    SCHED -->|"sends a clear scheduled message (e.g. ‘Mid-week batch scheduled for review’)", USER
```

**Agent Roles (in plain English):**
- **Supervisor Agent:** Reads your question, understands what you want, and decides what steps the AI should take (like analysis, simulation, or scheduling).
- **Treasury Analysis Agent:** Looks at your real bank data, checks if the payment is safe, and suggests the best way to proceed (including splitting or deferring payments if needed).
- **Synthesis Agent:** Writes a clear, friendly answer in plain English, tracks your confirmation (in any wording), and makes sure the next steps are scheduled and communicated.
- **Scheduler:** Keeps track of what’s scheduled and reminds you at the right time.

## What’s new?

- The AI now understands any confirmation wording (not just “yes” or “please do that”)—it uses advanced language models to detect your intent.
- Once you confirm, it gives a clear “scheduled” message and stops asking for more confirmation.
- This makes the experience smooth for everyone—no technical knowledge needed!
