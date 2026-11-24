// A player inside a block: the address a person copies from a site (the one a note's `::embed[…]` takes)
// turned into the address of that site's player, which the block's policy allows as a frame (`EMBEDS`).
//
//     <block-embed src="https://youtu.be/d6c6uIyieoo?t=90"></block-embed>
//
// `embedOf` is written once and runs on both sides: here, for an app or a check that wants to know what an
// address becomes, and inside the frame, where `<block-embed>` is made from its text.

/**
 * The player an address is shown with, or null when it is not one of the sites a block may show.
 * @param {string} address what a person copied: a watch page, a short link, a post, a track
 * @returns {{ site: "youtube" | "vimeo" | "spotify" | "reddit" | "instagram", src: string, ratio?: number, height?: number } | null}
 *   `src` is the player's address (always under one of `EMBEDS`). A video has a `ratio` (width / height); a
 *   player whose height is its own has a `height` in px.
 */
export function embedOf(address) {
  var url;
  try { url = new URL(String(address).trim()); } catch (e) { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  var host = url.hostname.replace(/^(www\.|m\.|mobile\.)/, "");
  var parts = url.pathname.split("/").filter(Boolean);
  var id = function (value, shape) { return value && shape.test(value) ? value : null; };
  // A start written as 90, 90s or 1m30s.
  var seconds = function (value) {
    if (!value) return 0;
    if (/^\d+$/.test(value)) return Number(value);
    var m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
    return m ? (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0) : 0;
  };
  if (host === "youtu.be" || host === "youtube.com" || host === "youtube-nocookie.com" || host === "music.youtube.com") {
    var video = host === "youtu.be" ? parts[0]
      : parts[0] === "watch" ? url.searchParams.get("v")
      : /^(embed|shorts|live|v)$/.test(parts[0] || "") ? parts[1] : null;
    video = id(video, /^[A-Za-z0-9_-]{6,20}$/);
    if (!video) return null;
    var start = seconds(url.searchParams.get("t") || url.searchParams.get("start"));
    // enablejsapi: the block can move the player (`seek`, `play`, `pause` on the element).
    return { site: "youtube", src: "https://www.youtube-nocookie.com/embed/" + video + "?enablejsapi=1&playsinline=1&rel=0" + (start ? "&start=" + start : ""), ratio: parts[0] === "shorts" ? 9 / 16 : 16 / 9 };
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    var clip = id(host === "player.vimeo.com" ? parts[1] : parts.filter(function (p) { return /^\d+$/.test(p); })[0], /^\d{3,12}$/);
    if (!clip) return null;
    var hash = url.searchParams.get("h") || (host === "vimeo.com" && /^[0-9a-f]{6,20}$/.test(parts[parts.indexOf(clip) + 1] || "") ? parts[parts.indexOf(clip) + 1] : "");
    return { site: "vimeo", src: "https://player.vimeo.com/video/" + clip + "?api=1" + (hash ? "&h=" + hash : ""), ratio: 16 / 9 };
  }
  if (host === "open.spotify.com") {
    var rest = parts[0] === "embed" ? parts.slice(1) : /^intl-/.test(parts[0] || "") ? parts.slice(1) : parts;
    var kind = rest[0], item = id(rest[1], /^[A-Za-z0-9]{10,40}$/);
    if (!item || !/^(track|album|playlist|episode|show|artist)$/.test(kind)) return null;
    return { site: "spotify", src: "https://open.spotify.com/embed/" + kind + "/" + item, height: kind === "track" || kind === "episode" ? 152 : 352 };
  }
  if (host === "reddit.com" || host === "old.reddit.com" || host === "embed.reddit.com") {
    if (parts[0] !== "r" || parts[2] !== "comments") return null;
    var sub = id(parts[1], /^[A-Za-z0-9_]{2,30}$/), thread = id(parts[3], /^[a-z0-9]{3,12}$/);
    if (!sub || !thread) return null;
    var slug = id(parts[4], /^[A-Za-z0-9_]{1,200}$/);
    return { site: "reddit", src: "https://embed.reddit.com/r/" + sub + "/comments/" + thread + "/" + (slug ? slug + "/" : ""), height: 520 };
  }
  if (host === "instagram.com") {
    var shape = parts[0] === "reel" || parts[0] === "reels" ? "reel" : parts[0] === "p" ? "p" : null;
    var shot = id(parts[1], /^[A-Za-z0-9_-]{5,40}$/);
    if (!shape || !shot) return null;
    return { site: "instagram", src: "https://www.instagram.com/" + shape + "/" + shot + "/embed/", height: 640 };
  }
  return null;
}

// Runs in a block that has a `<block-embed src="…">`. The element takes the shape of its player, as wide as its
// room: a video keeps its ratio (16:9), a player with a height of its own keeps it (`height="…"` changes it).
// - In a frame on a web page (`nested` false), it is a spot: it tells the page where it is, whenever that
//   changes, and the page lays the player over it (`mount`). The block never holds the player.
// - In a native app's web view (`nested` true), the document is not sandboxed, and the player is framed here.
// For YouTube and Vimeo, the element moves the player: `seek(seconds)`, `play()`, `pause()`.
// An address that is not one of the sites says so in the block, instead of leaving an empty box.
export const embedScript = (nested) => `(function(){
  if (!window.customElements || customElements.get('block-embed')) return;
  var embedOf = ${embedOf.toString()};
  var nested = ${nested ? "true" : "false"}, count = 0, all = [];
  var Base = window.HTMLElement;
  function BlockEmbed(){ return Reflect.construct(Base, [], BlockEmbed); }
  BlockEmbed.prototype = Object.create(Base.prototype);
  BlockEmbed.prototype.constructor = BlockEmbed;
  Object.setPrototypeOf(BlockEmbed, Base);
  BlockEmbed.observedAttributes = ['src', 'height'];
  BlockEmbed.prototype.connectedCallback = function(){
    if (!this.key) this.key = 'e' + (++count);
    if (all.indexOf(this) < 0) all.push(this);
    this.draw();
  };
  BlockEmbed.prototype.disconnectedCallback = function(){
    all.splice(all.indexOf(this), 1);
    if (!nested) parent.postMessage({ type: 'block-embed', id: this.key, gone: true }, '*');
  };
  BlockEmbed.prototype.attributeChangedCallback = function(){ if (this.isConnected) this.draw(); };
  BlockEmbed.prototype.draw = function(){
    var address = this.getAttribute('src') || '';
    var player = embedOf(address);
    if (!this.style.display) this.style.display = 'block';
    var drawn = address + '|' + this.getAttribute('height');
    if (this.drawn === drawn) return;
    this.drawn = drawn;
    this.textContent = '';
    this.site = player ? player.site : null;
    this.frame = null;
    if (!player) {
      var note = document.createElement('p');
      note.textContent = address ? 'Not a player a block can show: ' + address : 'block-embed needs a src';
      note.style.cssText = 'margin:0;padding:12px;border:1px dashed currentColor;opacity:.6;font:13px system-ui,sans-serif';
      this.appendChild(note);
      if (!nested) parent.postMessage({ type: 'block-embed', id: this.key, gone: true }, '*');
      return;
    }
    var height = Number(this.getAttribute('height')) || player.height;
    var box = nested ? document.createElement('iframe') : document.createElement('div');
    box.style.cssText = 'display:block;width:100%;border:0;border-radius:inherit;' + (height ? 'height:' + height + 'px' : 'aspect-ratio:' + player.ratio + ';height:auto');
    if (nested) {
      box.src = player.src;
      box.title = this.getAttribute('title') || player.site;
      box.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write');
      box.setAttribute('allowfullscreen', '');
      box.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      this.frame = box;
    } else {
      box.style.background = 'rgba(127,127,127,.12)';
      this.sent = '';
    }
    this.appendChild(box);
    if (!nested) place();
  };
  // Where each spot is in the frame, told to the page when it changes (a layout, a scroll inside the block).
  function place(){
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (!el.site) continue;
      var r = el.getBoundingClientRect();
      var at = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
      var now = at.join(',') + '|' + el.drawn;
      if (now === el.sent) continue;
      el.sent = now;
      parent.postMessage({ type: 'block-embed', id: el.key, src: el.getAttribute('src'), title: el.getAttribute('title') || '', x: at[0], y: at[1], width: at[2], height: at[3] }, '*');
    }
  }
  if (!nested) {
    var soon = 0;
    var later = function(){ if (!soon) soon = requestAnimationFrame(function(){ soon = 0; place(); }); };
    addEventListener('scroll', later, true);
    addEventListener('resize', later);
    addEventListener('load', later);
    if (window.ResizeObserver) new ResizeObserver(later).observe(document.documentElement);
    if (window.MutationObserver) new MutationObserver(later).observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  }
  function tell(el, act, value){
    if (!el.site) return;
    if (!nested) return parent.postMessage({ type: 'block-embed', id: el.key, act: act, value: value }, '*');
    if (!el.frame || !el.frame.contentWindow) return;
    var message = playerMessage(el.site, act, value);
    if (message) el.frame.contentWindow.postMessage(message[0], message[1]);
  }
  var playerMessage = ${playerMessage.toString()};
  BlockEmbed.prototype.seek = function(s){ tell(this, 'seek', Math.max(0, Number(s) || 0)); };
  BlockEmbed.prototype.play = function(){ tell(this, 'play'); };
  BlockEmbed.prototype.pause = function(){ tell(this, 'pause'); };
  customElements.define('block-embed', BlockEmbed);
})();`;

/**
 * What a player is sent to seek, play or pause it, and to which origin; null for a site that takes none.
 * @param {string} site
 * @param {"seek" | "play" | "pause"} act
 * @param {number} [value] seconds, for seek
 * @returns {[string, string] | null}
 */
export function playerMessage(site, act, value) {
  if (site === "youtube") {
    var call = act === "seek" ? ["seekTo", value, true] : act === "play" ? ["playVideo"] : act === "pause" ? ["pauseVideo"] : null;
    return call ? [JSON.stringify({ event: "command", func: call[0], args: call.slice(1) }), "https://www.youtube-nocookie.com"] : null;
  }
  if (site === "vimeo") {
    var order = act === "seek" ? { method: "setCurrentTime", value: value } : act === "play" ? { method: "play" } : act === "pause" ? { method: "pause" } : null;
    return order ? [JSON.stringify(order), "https://player.vimeo.com"] : null;
  }
  return null;
}
