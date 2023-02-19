// TODO fix dumb name
export class CanvasWrapper extends HTMLCanvasElement {
  constructor() {
    super();
    this.handle = undefined;
    this.resizeObserver = new ResizeObserver((_entries) => {
      this.width = this.clientWidth;
      this.height = this.clientHeight;
    });
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

customElements.define("canvas-wrapper", CanvasWrapper, { extends: "canvas" });
