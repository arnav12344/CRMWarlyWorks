import { describe, it, expect } from "vitest";
import { buildEmailContent, htmlToText, replySubject, stripLegacyFooter, textToHtml, LEGACY_OPT_OUT_FOOTER } from "../mail/compose";
import { extractGmailSignature, sanitizeSignatureHtml, signatureFromText } from "../mail/signature";

// The shape of a real email sent from Gmail on the web with a signature.
const GMAIL_SENT_HTML =
  '<div dir="ltr">Hi Ms Tan,<div><br></div><div>Quick question.</div><div><br clear="all"></div><div><br></div>' +
  '<span class="gmail_signature_prefix">-- </span><br>' +
  '<div dir="ltr" class="gmail_signature" data-smartmail="gmail_signature"><div dir="ltr">' +
  "<div><b>Arnav Malhotra</b></div><div>Founder, WarlyWorks</div>" +
  '<div><a href="https://www.warlyworks.com" target="_blank">www.warlyworks.com</a> · <a href="https://wa.me/6500000000">WhatsApp</a></div>' +
  '<img src="https://ci3.googleusercontent.com/mail-sig/logo" width="96">' +
  "</div></div></div>";

describe("replySubject", () => {
  it("adds exactly one Re:", () => {
    expect(replySubject("Hello")).toBe("Re: Hello");
    expect(replySubject("Re: Hello")).toBe("Re: Hello");
    expect(replySubject("RE: re:  Hello")).toBe("Re: Hello");
  });
});

describe("buildEmailContent", () => {
  it("escapes what you wrote in the HTML part and keeps line breaks", () => {
    const { text, html } = buildEmailContent({ body: "Hi <team> & co\nLine 2" });
    expect(text).toBe("Hi <team> & co\nLine 2");
    expect(html).toBe('<div dir="ltr">Hi &lt;team&gt; &amp; co<br>Line 2</div>');
    expect(textToHtml("a\r\nb")).toBe("a<br>b");
  });

  it("puts the signature after the body, before any quoted history", () => {
    const sig = signatureFromText("Arnav\nwww.warlyworks.com")!;
    const { text, html } = buildEmailContent({
      body: "Any update?",
      signature: sig,
      thread: [{ body: "First email", sentAt: new Date("2026-10-01T01:00:00Z"), fromName: "Arnav", fromAddress: "a@warlyworks.com" }],
    });
    expect(text).toBe(
      "Any update?\n\nArnav\nwww.warlyworks.com\n\nOn Thu, 1 Oct 2026 at 09:00, Arnav <a@warlyworks.com> wrote:\n\n> First email"
    );
    expect(html.indexOf("gmail_signature")).toBeLessThan(html.indexOf("gmail_quote"));
    expect(html).toContain("&lt;<a href=\"mailto:a@warlyworks.com\">a@warlyworks.com</a>&gt; wrote:");
  });

  it("stripLegacyFooter removes the old opt-out line only when it's at the end", () => {
    expect(stripLegacyFooter(`Hello\n\n${LEGACY_OPT_OUT_FOOTER}`)).toBe("Hello");
    expect(stripLegacyFooter("Hello")).toBe("Hello");
  });
});

describe("Gmail signature import", () => {
  it("extracts the signature block (nested divs balanced, '-- ' prefix left out)", () => {
    const block = extractGmailSignature(GMAIL_SENT_HTML);
    expect(block).not.toBeNull();
    expect(block!.startsWith('<div dir="ltr" class="gmail_signature"')).toBe(true);
    expect(block).toContain("Founder, WarlyWorks");
    expect(block).toContain("mail-sig/logo");
    expect(block).not.toContain("Quick question");
    expect(block).not.toContain("gmail_signature_prefix");
  });

  it("ignores signatures inside quoted history", () => {
    const quotedOnly =
      '<div dir="ltr">Thanks!</div><div class="gmail_quote"><blockquote class="gmail_quote">' +
      '<div class="gmail_signature">Someone Else</div></blockquote></div>';
    expect(extractGmailSignature(quotedOnly)).toBeNull();
    const afterQuote = `${quotedOnly}<div class="gmail_signature">Arnav</div>`;
    expect(extractGmailSignature(afterQuote)).toBe('<div class="gmail_signature">Arnav</div>');
  });

  it("makes a readable text version, keeping URLs that the link text hides", () => {
    const text = htmlToText(extractGmailSignature(GMAIL_SENT_HTML));
    expect(text).toBe("Arnav Malhotra\nFounder, WarlyWorks\nwww.warlyworks.com · WhatsApp <https://wa.me/6500000000>");
  });

  it("sanitizes scripts, handlers, javascript: links and embedded cid: images", () => {
    const { html, droppedEmbeddedImages } = sanitizeSignatureHtml(
      '<div class="gmail_signature" onclick="steal()"><script>alert(1)</script>' +
        '<a href="javascript:alert(1)">x</a><img src="cid:ii_123"><img src="https://x.test/logo.png" onerror="boom()"></div>'
    );
    expect(html).not.toMatch(/script|onclick|onerror|javascript:|cid:/i);
    expect(html).toContain('src="https://x.test/logo.png"');
    expect(droppedEmbeddedImages).toBe(true);
  });

  it("signatureFromText builds safe HTML and clears on empty", () => {
    expect(signatureFromText("  ")).toBeNull();
    expect(signatureFromText("A <b>\nB")!.html).toContain("A &lt;b&gt;<br>B");
  });
});
