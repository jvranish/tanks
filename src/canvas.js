// TODO fix dumb name

export class CanvasWrapper extends HTMLElement {
  constructor() {
    super();
    this.handle = undefined;
    this.canvas = document.createElement("canvas");
    this.resizeObserver = new ResizeObserver((_entries) => {
      this.canvas.width = this.clientWidth;
      this.canvas.height = this.clientHeight;
    });

    this.attachShadow({ mode: "open" }).appendChild(this.canvas);
  }

  connectedCallback() {
    this.tabIndex = 0;
    this.focus();
    this.resizeObserver.observe(this);
    /** @param {number} time */
    const render = (time) => {
      const event = new CustomEvent("frame", {
        detail: { time },
      });
      this.dispatchEvent(event);
      this.handle = requestAnimationFrame(render);
    };
    this.handle = requestAnimationFrame(render);
  }

  disconnectedCallback() {
    this.resizeObserver.disconnect();
    if (this.handle) {
      cancelAnimationFrame(this.handle);
    }
  }
}

customElements.define("canvas-wrapper", CanvasWrapper);
