
# High-Level Design — Treasury AI Assistant

## What does this system do?

This AI assistant helps treasury teams make safe, confident payment decisions. It reviews your company’s real bank data, cashflow, and supplier commitments, then gives clear, conversational advice—no jargon, no guesswork.

**Key features:**
- Answers questions about supplier payments, cashflow, and liquidity in plain English
- Always checks real data before giving advice
- Suggests safe ways to split or schedule payments if needed
- Understands your intent—even if you confirm in your own words
- Clearly tells you when a payment is “scheduled” (no repeated confirmations)

## How does it work? (Simple Flow)

1. **You ask a question** (e.g., “Can I pay £750,000 to suppliers today?”)
2. **The AI reviews your real bank data** (balances, upcoming payments, expected inflows)
3. **It checks if the payment is safe**
4. **If there’s a risk, it suggests splitting or scheduling** (e.g., “Pay £520k now, rest mid-week”)
5. **You confirm in your own words** (e.g., “Yes, go ahead”)
6. **The AI schedules the payment and tells you clearly** (e.g., “The mid-week batch has been scheduled for review. I’ll notify you before release.”)
7. **No repeated questions—just clear next steps**

## Visual Overview

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
