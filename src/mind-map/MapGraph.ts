import BasicMapGraph from "./BasicMapGraph";
import { Vec2, Size, Rect } from "../common/types";
import MapNode from "./MapNode";
import _ from "./utils";
import { MAP_NODE_STYLES, MAP_VERTICAL_INTERVAL, MAP_INSERT_MARK_STYLE } from "./constants";

/**
 * BasicMapGraph with canvas interactions
 */
export default class MapGraph extends BasicMapGraph {
  protected _mouseLeftDragging: boolean;
  protected _mouseLeftStartPos: Vec2;
  protected _mouseRightDragging: boolean;
  protected _mouseRightStartPos: Vec2;
  protected _draggingNodeId: number;
  protected _targetNodeId: number;

  constructor(dom: HTMLElement) {
    super(dom);
    this._mouseLeftDragging = false;
    this._mouseLeftStartPos = { x: 0, y: 0 };
    this._mouseRightDragging = false;
    this._mouseRightStartPos = { x: 0, y: 0 };
    this._draggingNodeId = -1;
    this._targetNodeId = -1;
    this._registerInteractions();
  }

  dispose() {
    this._unregisterInteractions();
    super.dispose();
  }

  private _registerInteractions() {
    const canvas = this._canvas;
    // scaling and scrolling
    canvas.addEventListener('wheel', this._handleWheel);
    // panning and node dragging
    canvas.addEventListener('mousedown', this._handleMouseDown);
    canvas.addEventListener('mouseup', this._handleMouseUp);
    canvas.addEventListener('mouseleave', this._handleMouseLeave);
    canvas.addEventListener('mousemove', this._handleMouseMove);
    // updating node content
    canvas.addEventListener('dblclick', this._handleDoubleClick);
    // prevent default context menu when right click
    canvas.addEventListener('contextmenu', this._handleContextMenu);
    // add, delete, copy, cut, paste...key related interactions
    window.addEventListener('keyup', this._handleKeyUp);
  }

  private _unregisterInteractions() {
    const canvas = this._canvas;
    // scaling and scrolling
    canvas.removeEventListener('wheel', this._handleWheel);
    // panning and node dragging
    canvas.removeEventListener('mousedown', this._handleMouseDown);
    canvas.removeEventListener('mouseup', this._handleMouseUp);
    canvas.removeEventListener('mouseleave', this._handleMouseLeave);
    canvas.removeEventListener('mousemove', this._handleMouseMove);
    // updating node content
    canvas.removeEventListener('dblclick', this._handleDoubleClick);
    // prevent default context menu when right click
    canvas.removeEventListener('contextmenu', this._handleContextMenu);
    // add, delete, copy, cut, paste...key related interactions
    window.removeEventListener('keyup', this._handleKeyUp);
  }
  
  private _handleWheel = (ev: WheelEvent) => {
    ev.preventDefault();
    if (ev.ctrlKey || ev.metaKey) {
      // scaling
      const deltaScale = ev.deltaY > 0 ? -0.05 : 0.05;
      let scale = this._scale + deltaScale;
      scale = scale > 4 ? 4 : scale;
      scale = scale < 0.5 ? 0.5 : scale;
      this.scale(scale);
    } else {
      // scrolling
      const trans = this._translate;
      this.translate({
        x: trans.x,
        y: trans.y - ev.deltaY * 5
      });
    }
  }

  private _handleMouseDown = (ev: MouseEvent) => {
    if (ev.button === 0) {
      this._mouseLeftStartPos = {
        x: ev.offsetX,
        y: ev.offsetY
      };
      const pos: Vec2 = this.domToCanvas(this._mouseLeftStartPos);
      const node = this._getNodeAtPosition(pos);
      if (node) {
        this._draggingNodeId = node.id;
        this.selectedNode(this._draggingNodeId);
      } else {
        this.selectedNode(-1);
      }
      this._mouseLeftDragging = true;
    } else if (ev.button === 2) {
      this._mouseRightStartPos = {
        x: ev.offsetX,
        y: ev.offsetY
      };
      this._mouseRightDragging = true;
    }
  }

  private _handleMouseMove = (ev: MouseEvent) => {
    if (this._mouseLeftDragging) {
      if (this._draggingNodeId >= 0) {
        // dragging node
        const node = this._nodeIndices[this._draggingNodeId];
        if (node) {
          // render dragging node
          const draggingNode = new MapNode(node.id, node.type(), node.depth, node.text(), node.comment());
          let newPos = this.canvasToDom(node.position());
          newPos = this.domToCanvas({
            x: newPos.x + ev.offsetX - this._mouseLeftStartPos.x,
            y: newPos.y + ev.offsetY - this._mouseLeftStartPos.y
          });
          draggingNode.position(newPos);
          const style = _.getScaledNodeStyle(draggingNode.type(), this._scale);
          style.color = style.draggingColor;
          style.background = style.draggingBackground;
          style.borderColor = style.draggingBorderColor;
          requestAnimationFrame(() => this._renderNode(draggingNode, style));

          // render insert mark
          const pos: Vec2 = this.domToCanvas({
            x: ev.offsetX,
            y: ev.offsetY
          });
          const targetNode = this._getNodeAtPosition(pos);
          if (targetNode && targetNode.parent && !targetNode.isDescendentOf(draggingNode)) {
            this._targetNodeId = targetNode.id;
            requestAnimationFrame(() => this._renderInsertMark(targetNode));
          }

          this._needsRerender = true;
        }
      } else {
        // dragging canvas
        const deltaPos: Vec2 = {
          x: ev.movementX,
          y: ev.movementY
        };
        const trans = this._translate;
        this.translate({
          x: trans.x + deltaPos.x,
          y: trans.y + deltaPos.y
        });
      }
    } else if (this._mouseRightDragging) {
      // TODO: right mouse dragging logic
    }
  }

  private _handleMouseUp = (ev: MouseEvent) => {
    if (ev.button === 0) {
      if (this._draggingNodeId >= 0) {
        const draggingNode = this._nodeIndices[this._draggingNodeId];
        if (draggingNode && this._targetNodeId >= 0) {
          const targetNode = this._nodeIndices[this._targetNodeId];  
          if (targetNode && targetNode.parent) {
            this.deleteNode(draggingNode.id);
            const pos = targetNode.parent.children.findIndex(child => child.id === targetNode.id);
            this.addExistingNode(targetNode.parent.id, draggingNode, pos);
            this.selectedNode(draggingNode.id);
            this._targetNodeId = -1;
          }
        }
        this._draggingNodeId = -1;
        this._needsRerender = true;
      }
      this._mouseLeftStartPos = { x: 0, y: 0 };
      this._mouseLeftDragging = false;
    } else if (ev.button === 2) {
      this._mouseRightStartPos = { x: 0, y: 0 };
      this._mouseRightDragging = false;
    }
  }

  private _handleMouseLeave = () => {
    this._draggingNodeId = -1;
    this._mouseLeftDragging = false;
    this._mouseRightDragging = false;
  }

  private _handleDoubleClick = (ev: MouseEvent) => {
    if (ev.button === 0) {
      const pos: Vec2 = this.domToCanvas({
        x: ev.offsetX,
        y: ev.offsetY
      });
      const node = this._getNodeAtPosition(pos);
      if (!node) {
        return;
      }
      this._renderInput(node);
    }
  }

  private _handleKeyUp = (ev: KeyboardEvent) => {
    //FIXME: Cmd key only works in keydown event
    const selectedNode = this.selectedNode();
    if (!selectedNode) {
      return;
    }
    switch(ev.key) {
      // TODO: support switch selection by arrow key, maybe need to use depth prop
      case "ArrowDown":
        break;
      case "ArrowUp":
        break;
      case "ArrowLeft":
        break;
      case "ArrowRight":
        break;
      case "Enter": { // Enter: add sibling node, Ctrl+Enter: add child node
        let newNodeId = -1;
        if (ev.ctrlKey || ev.metaKey) {
          newNodeId = this.addNode(selectedNode.id);
        } else {
          const parent = selectedNode.parent;
          if (parent) {
            const pos = parent.children.findIndex(child => child.id === selectedNode.id);
            newNodeId = this.addNode(parent.id, undefined, pos >= 0 ? pos + 1 : undefined);
          }
        }
        const selNode = this.selectedNode(newNodeId);
        requestAnimationFrame(() => this._renderInput(selNode));
        // TODO: scroll into view
        break;
      }
      case "Delete": {
        this.deleteNode(selectedNode.id);
        break;
      }
      case "Escape": {  // remove selection
        this.selectedNode(-1);
        break;
      }
      case "c": {
        if (ev.ctrlKey || ev.metaKey) { // copy
          this.copyNode(selectedNode.id);
        }
        break;
      }
      case "x": {
        if (ev.ctrlKey || ev.metaKey) { // cut
          this.cutNode(selectedNode.id);
        }
        break;
      }
      case "v": {
        if (ev.ctrlKey || ev.metaKey) { // paste
          this.pasteNode(selectedNode.id);
        }
        break;
      }
      default: return;
    }
  }

  private _handleContextMenu = (ev: MouseEvent) => {
    ev.preventDefault();
  }

  private _getNodeAtPosition(pos: Vec2): MapNode | null {
    for (let id in this._nodeIndices) {
      const node = this._nodeIndices[id];
      const lt: Vec2 = node.position();
      const rb: Vec2 = {
        x: lt.x + node.size().w,
        y: lt.y + node.size().h
      };
      if (pos.x >= lt.x && pos.x <= rb.x && pos.y >= lt.y && pos.y <= rb.y) {
        return node;
      }
    }
    return null;
  }

  private _renderInput(node: MapNode | null) {
    if (!node) {
      return;
    }
    const style = MAP_NODE_STYLES[node.type()];
    const textPadding = style.borderWidth;
    const inputLT: Vec2 = this.canvasToDom({
      x: node.position().x + textPadding,
      y: node.position().y + textPadding,
    });
    const inputSize: Size = {
      w: (node.size().w - textPadding * 2) * this._scale,
      h: (node.size().h - textPadding * 2) * this._scale
    };
    const scaledStyle = _.getScaledNodeStyle(node.type(), this._scale);
    const input = document.createElement('input');
    input.value = node.text();
    input.style.font = `${scaledStyle.fontStyle} normal ${scaledStyle.fontWeight} ${scaledStyle.fontSize}px ${scaledStyle.fontFamily}`;
    input.style.position = 'absolute';
    input.style.left = `${inputLT.x}px`;
    input.style.top = `${inputLT.y}px`;
    input.style.width = `${inputSize.w}px`;
    input.style.minWidth = '40px';
    input.style.height = `${inputSize.h}px`;
    input.addEventListener('blur', (ev: FocusEvent) => {
      ev.stopPropagation();
      const inputEle = ev.target as HTMLInputElement;
      if (inputEle.value && inputEle.value !== node.text()) {
        this.updateNode(node.id, inputEle.value);
      }
      inputEle.remove();
    });
    input.addEventListener('keyup', (ev: KeyboardEvent) => {
      ev.stopPropagation();
      if (ev.key === 'Enter' || ev.key === 'Escape') {
        const inputEle = ev.target as HTMLInputElement;
        inputEle.blur();
      }
    });
    this._dom.appendChild(input);
    input.focus();
    input.select();
  }

  private _renderInsertMark(node: MapNode | null) {
    if (!node || !node.parent) {
      return;
    }
    const markStyle = _.getScaledInsertMarkStyle(this._scale);
    const linkStyle = _.getScaledLinkStyle(this._scale);
    linkStyle.lineColor = markStyle.background;
    const dummyNode = node.clone();
    dummyNode.position({
      x: node.position().x,
      y: node.position().y - MAP_VERTICAL_INTERVAL / 2 - markStyle.height / 2
    });
    dummyNode.size({
      w: MAP_INSERT_MARK_STYLE.width,
      h: MAP_INSERT_MARK_STYLE.height
    });
    const markRect: Rect = {
      x: dummyNode.position().x * this._scale,
      y: dummyNode.position().y * this._scale,
      w: markStyle.width,
      h: markStyle.height
    }
    this._renderLink(node.parent, dummyNode, linkStyle);
    const ctx = this._ctx;
    ctx.beginPath();
    ctx.fillStyle = markStyle.background;
    ctx.fillRect(markRect.x, markRect.y, markRect.w, markRect.h);
  }
}