// Personal invitation URLs keep their access key in the fragment, including on WhatsApp previews.
const invitePath = token => "#/invite/" + encodeURIComponent(token);
const listingPath = id => "#/experiences/" + encodeURIComponent(id);
const statusLabels = { pending: "Awaiting reply", accepted: "Accepted", declined: "Declined", withdrawn: "Withdrawn" };

export function renderInvitations({ main, route, state, esc, api, signIn }) {
  main.innerHTML = '<section class="inside invite-page"><div class="invite-wrap"></div></section>';
  const panel = main.querySelector(".invite-wrap");
  const back = '<a class="text-link" href="#/experiences">GoWings Experience</a>';
  const history = '<a class="text-link" href="#/invites">My invitations</a>';
  const feedback = '<p class="feedback" role="status" aria-live="polite"></p>';
  const show = html => { if (panel.isConnected) panel.innerHTML = html; };
  const loading = heading => show(back + '<h1>' + heading + '</h1><p role="status">Loading…</p>');
  function report(err) {
    if (!panel.isConnected) return;
    const output = panel.querySelector(".feedback");
    if (output) output.textContent = err.message;
    else show(back + '<h1>Invitation unavailable</h1><p>' + esc(err.message) + '</p>' + history);
  }
  function onSubmit(fn) {
    const form = panel.querySelector("form");
    if (!form) return;
    form.onsubmit = async event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const buttons = form.querySelectorAll("button");
      buttons.forEach(b => b.disabled = true);
      try { await fn(data, event.submitter); } catch (err) { report(err); }
      finally { buttons.forEach(b => b.disabled = false); }
    };
  }
  function subject(record) {
    return '<a class="invite-listing" href="' + listingPath(record.listingId) + '">' + esc(record.listingName) + '</a>';
  }
  function share(record, phone = "") {
    const page = new URL(location.href);
    page.search = "";
    page.hash = invitePath(record.token);
    const text = record.senderName + " invited you to " + record.listingName + " on GoWings Experience. View your invitation: " + page.href;
    show(back + '<h1>Share your invitation</h1><p>Send the private link to ' + esc(record.recipientName) +
      '. They can sign in, unlock it with their WhatsApp number and reply.</p><div class="invite-postcard"><small>FOR ' +
      esc(record.recipientName.toUpperCase()) + '</small><h2>' + esc(record.listingName) + '</h2>' +
      (record.message ? '<p>' + esc(record.message) + '</p>' : '') + '<b>From ' + esc(record.senderName) +
      '</b></div><div class="invite-actions"><a class="btn" target="_blank" rel="noopener noreferrer" href="' +
      esc("https://wa.me/" + phone + "?text=" + encodeURIComponent(text)) +
      '">Open WhatsApp</a><button class="text-link" data-copy>Copy private link</button>' + history + '</div>' + feedback);
    const copy = panel.querySelector("[data-copy]");
    if (copy) copy.onclick = async () => {
      try { await navigator.clipboard.writeText(page.href); panel.querySelector(".feedback").textContent = "Private link copied."; }
      catch {
        const output = panel.querySelector(".feedback");
        output.innerHTML = '<label>Copy your private link<input readonly value="' + esc(page.href) + '"></label>';
        output.querySelector("input").select();
      }
    };
  }
  function detail(record) {
    if (!panel.isConnected) return;
    if (record.locked) {
      show(back + '<h1>Open your invitation</h1><p>Enter the WhatsApp number your inviter used. This connects the invitation to your signed-in account.</p><form class="stack invite-form"><label>Your WhatsApp number<input name="phone" type="tel" autocomplete="tel" placeholder="+91 98765 43210" required maxlength="24"></label>' +
        feedback + '<button class="btn">Open invitation</button></form>');
      onSubmit(async ({phone}) => detail(await api("/api/invitations/" + route[2], {action:"open", phone})));
      return;
    }
    const sent = record.direction === "sent";
    show(back + '<h1>' + (sent ? 'Your invitation' : 'An invitation for you') + '</h1><div class="invite-postcard"><small>' +
      esc(statusLabels[record.status]) + '</small><h2>' + esc(record.senderName) + ' invited ' +
      (sent ? esc(record.recipientName) : 'you') + ' to ' + subject(record) + '</h2>' +
      (record.message ? '<p>' + esc(record.message) + '</p>' : '') +
      (record.preview ? '<p><small>Preview experience · bookings are not open.</small></p>' : '') + '</div>' +
      (record.status === "pending" ? '<form class="invite-actions">' +
        (sent ? '<button type="button" class="btn" data-share>Share private link</button><button value="withdraw" class="text-link">Withdraw invitation</button>' :
          '<button class="btn" value="accepted">Accept invitation</button><button class="text-link" value="declined">Decline</button>') +
        feedback + '</form>' : '') + history);
    const shareButton = panel.querySelector("[data-share]");
    if (shareButton) shareButton.onclick = () => share(record);
    onSubmit(async (_data, btn) => {
      const result = await api("/api/invitations/" + record.token, {action:btn.value});
      detail(result);
    });
  }

  if (!state.user) {
    show(back + '<h1>' + (route[1] === "invites" ? 'My invitations' : 'Your experience invitation') +
      '</h1><p>Sign in to send an invitation or reply to one privately.</p><button class="btn" data-auth>Sign in</button>');
    panel.querySelector("[data-auth]").onclick = signIn;
    return;
  }
  if (route[1] === "invites") {
    loading("My invitations");
    api("/api/invitations").then(items => {
      const section = (direction, label, empty) => {
        const list = items.filter(r => r.direction === direction);
        return '<section class="invite-history"><h2>' + label + '</h2>' + (list.length ? list.map(r =>
          '<a href="' + invitePath(r.token) + '"><div><strong>' + esc(r.listingName) + '</strong><small>' +
          (direction === "sent" ? 'To ' + esc(r.recipientName) : 'From ' + esc(r.senderName)) +
          '</small></div><span>' + esc(statusLabels[r.status]) + '</span></a>').join("") : '<p>' + empty + '</p>') + '</section>';
      };
      show(back + '<h1>My invitations</h1>' + section("sent","Sent","You haven’t sent an invitation yet.") +
        section("received","Received","Open an invitation link to see it here."));
    }).catch(report);
    return;
  }
  if (route[2] === "new") {
    const p = (state.experiences || []).find(item => item.id === route[3]) || state.products.find(item => item.id === route[3]);
    if (!p || !["activity", "property", "spot"].includes(p.kind)) {
      show(back + '<h1>Experience unavailable</h1>'); return;
    }
    const requestId = crypto.randomUUID();
    show(back + '<h1>Invite someone</h1><p>Plan ' + esc(p.name) + ' together. You choose when to share the invitation.</p><form class="stack invite-form">' +
      '<label>Your name<input name="senderName" value="' + esc(state.user.name || "") + '" required maxlength="80" autocomplete="name"></label>' +
      '<label>Their name<input name="recipientName" required maxlength="80"></label><label>Their WhatsApp number<input type="tel" name="phone" placeholder="+91 98765 43210" required maxlength="24"></label>' +
      '<label>Your message <small>(optional)</small><textarea name="message" maxlength="500" rows="3" placeholder="Fancy making a day of it?"></textarea></label>' + feedback + '<button class="btn">Create invitation</button></form>');
    onSubmit(async data => {
      const record = await api("/api/invitations", {...data, requestId, listingId:p.id});
      const digits = data.phone.replace(/[^\d+]/g, "");
      if (panel.isConnected) share(record, /^\d{10}$/.test(digits) ? "91" + digits : digits.replace(/^\+/, ""));
    });
    return;
  }
  if (!/^[\da-f-]{36}$/.test(route[2] || "")) {
    show(back + '<h1>Invitation unavailable</h1>'); return;
  }
  loading("Your invitation");
  api("/api/invitations/" + route[2]).then(detail).catch(report);
}
