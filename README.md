<h1 align="center">
  <img src="reply-by-identity/reply-by-github.png" alt="Reply-By" width="500" />
</h1>

<p align="center">
  <strong>Find the deadline. See the line that says so.</strong><br />
  <a href="https://reply-by.vercel.app/">reply-by.vercel.app</a>
</p>

A formal notice shouldn’t leave you guessing what to do or when. **Reply-By** is a mobile-first tool in development that turns an English-language notice into a plain-language action card. It’s designed for notices from any country, without assuming what local law says.

> **Current status: interactive design prototype.** The landing page includes a clickable demo with a fictional notice. It doesn’t accept or analyze real documents yet.

## What goes on the card

| | What Reply-By shows |
| --- | --- |
| **What to do** | The specific action the sender is asking for. |
| **When it’s due** | The stated date, or a date calculated from the notice’s wording and the day you received it. If there’s not enough information, it says so. |
| **Where it says that** | The exact sentence from the notice, so you can check the answer yourself. |

## One notice, one next step

The fictional Northline Housing notice in the demo says:

> Please send a copy of your payment receipt within 14 calendar days of receiving this letter.

If you received it on **12 November 2026**, the card says to **send a copy of the payment receipt by 26 November 2026**. The distinction matters: the letter asks for proof of payment, not another payment.

## Try the prototype

1. Open the [live preview](https://reply-by.vercel.app/#android). No install or account is needed.
2. Choose **Try the sample** and follow the prompts.
3. On the result card, tap the date to see the sentence that supports it.

To try it locally, open `index.html` in a browser. Open `reply-by-android.html` for the standalone Android design and motion specs.

## Website and Android app

- **Website:** [reply-by.vercel.app](https://reply-by.vercel.app/) currently hosts the browser preview. The planned reader will let you choose a **PDF, PNG, or JPG** file or **paste the notice text** directly. Both routes will produce the same action card.
- **Android app:** A dedicated app will be built separately from the website. The current Android prototype is a design reference, not an installable app.

## What’s next

- [ ] Build the notice-reading logic: find the requested action, show the due date or flag uncertainty, and cite the exact supporting sentence.
- [ ] Make both web inputs work: paste text or pick a file. Extract text from PDFs and use OCR to read PNG and JPG images.
- [ ] Build and test the dedicated Android app.
- [ ] Explore camera capture on Android and editable drafts for routine replies.

Reply-By is designed to explain what a notice says, not to give legal advice. It won’t send a reply for you.
