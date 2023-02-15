//@ts-nocheck

// Copyright © Jorge Bucaran <https://jorgebucaran.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

var SSR_NODE = 1;
var TEXT_NODE = 3;
var EMPTY_OBJ = {};
var EMPTY_ARR = [];
var SVG_NS = "http://www.w3.org/2000/svg";

var createClass = (obj) => {
  var out = "";

  if (typeof obj === "string") return obj;

  if (Array.isArray(obj)) {
    for (var k = 0, tmp; k < obj.length; k++) {
      if ((tmp = createClass(obj[k]))) {
        out += (out && " ") + tmp;
      }
    }
  } else {
    for (var k in obj) {
      if (obj[k]) out += (out && " ") + k;
    }
  }

  return out;
};

var listener = function (event) {
  this.events[event.type](event);
};

var getKey = (vdom) => (vdom == null ? vdom : vdom.key);

var patchProperty = (node, key, oldValue, newValue, isSvg) => {
  if (key === "style") {
    if (typeof newValue === "string") {
      node.style.cssText = newValue;
    } else {
      if (typeof oldValue === "string") oldValue = node.style.cssText = "";
      for (var k in { ...oldValue, ...newValue }) {
        oldValue = newValue == null || newValue[k] == null ? "" : newValue[k];
        if (k[0] === "-") {
          node[key].setProperty(k, oldValue);
        } else {
          node[key][k] = oldValue;
        }
      }
    }
  } else if (key[0] === "o" && key[1] === "n") {
    if (
      !((node.events || (node.events = {}))[(key = key.slice(2))] = newValue)
    ) {
      node.removeEventListener(key, listener);
    } else if (!oldValue) {
      node.addEventListener(key, listener);
    }
  } else if (!isSvg && key !== "list" && key !== "form" && key in node) {
    node[key] = newValue == null ? "" : newValue;
  } else if (newValue == null || newValue === false) {
    node.removeAttribute(key);
  } else {
    node.setAttribute(key, newValue);
  }
};

var createNode = (vdom, isSvg) => {
  var props = vdom.props;
  var node =
    vdom.type === TEXT_NODE
      ? document.createTextNode(vdom.tag)
      : (isSvg = isSvg || vdom.tag === "svg")
      ? document.createElementNS(SVG_NS, vdom.tag, props.is && props)
      : document.createElement(vdom.tag, props.is && props);

  for (var k in props) {
    patchProperty(node, k, null, props[k], isSvg);
  }

  for (var i = 0; i < vdom.children.length; i++) {
    node.appendChild(
      createNode(
        (vdom.children[i] = maybeVNode(vdom.children[i])),
        isSvg
      )
    );
  }

  return (vdom.node = node);
};

var patchNode = (parent, node, oldVNode, newVNode, isSvg) => {
  if (oldVNode === newVNode);
  else if (
    oldVNode != null &&
    oldVNode.type === TEXT_NODE &&
    newVNode.type === TEXT_NODE
  ) {
    if (oldVNode.tag !== newVNode.tag) node.nodeValue = newVNode.tag;
  } else if (oldVNode == null || oldVNode.tag !== newVNode.tag) {
    node = parent.insertBefore(
      createNode((newVNode = maybeVNode(newVNode)), isSvg),
      node
    );
    if (oldVNode != null) {
      parent.removeChild(oldVNode.node);
    }
  } else {
    var tmpVKid;
    var oldVKid;

    var oldKey;
    var newKey;

    var oldProps = oldVNode.props;
    var newProps = newVNode.props;

    var oldVKids = oldVNode.children;
    var newVKids = newVNode.children;

    var oldHead = 0;
    var newHead = 0;
    var oldTail = oldVKids.length - 1;
    var newTail = newVKids.length - 1;

    isSvg = isSvg || newVNode.tag === "svg";

    for (var i in { ...oldProps, ...newProps }) {
      if (
        (i === "value" || i === "selected" || i === "checked"
          ? node[i]
          : oldProps[i]) !== newProps[i]
      ) {
        patchProperty(
          node,
          i,
          oldProps[i],
          newProps[i],
          isSvg
        );
      }
    }

    while (newHead <= newTail && oldHead <= oldTail) {
      if (
        (oldKey = getKey(oldVKids[oldHead])) == null ||
        oldKey !== getKey(newVKids[newHead])
      ) {
        break;
      }

      patchNode(
        node,
        oldVKids[oldHead].node,
        oldVKids[oldHead],
        (newVKids[newHead] = maybeVNode(
          newVKids[newHead++],
          oldVKids[oldHead++]
        )),
        isSvg
      );
    }

    while (newHead <= newTail && oldHead <= oldTail) {
      if (
        (oldKey = getKey(oldVKids[oldTail])) == null ||
        oldKey !== getKey(newVKids[newTail])
      ) {
        break;
      }

      patchNode(
        node,
        oldVKids[oldTail].node,
        oldVKids[oldTail],
        (newVKids[newTail] = maybeVNode(
          newVKids[newTail--],
          oldVKids[oldTail--]
        )),
        isSvg
      );
    }

    if (oldHead > oldTail) {
      while (newHead <= newTail) {
        node.insertBefore(
          createNode(
            (newVKids[newHead] = maybeVNode(newVKids[newHead++])),
            isSvg
          ),
          (oldVKid = oldVKids[oldHead]) && oldVKid.node
        );
      }
    } else if (newHead > newTail) {
      while (oldHead <= oldTail) {
        node.removeChild(oldVKids[oldHead++].node);
      }
    } else {
      for (var keyed = {}, newKeyed = {}, i = oldHead; i <= oldTail; i++) {
        if ((oldKey = oldVKids[i].key) != null) {
          keyed[oldKey] = oldVKids[i];
        }
      }

      while (newHead <= newTail) {
        oldKey = getKey((oldVKid = oldVKids[oldHead]));
        newKey = getKey(
          (newVKids[newHead] = maybeVNode(newVKids[newHead], oldVKid))
        );

        if (
          newKeyed[oldKey] ||
          (newKey != null && newKey === getKey(oldVKids[oldHead + 1]))
        ) {
          if (oldKey == null) {
            node.removeChild(oldVKid.node);
          }
          oldHead++;
          continue;
        }

        if (newKey == null || oldVNode.type === SSR_NODE) {
          if (oldKey == null) {
            patchNode(
              node,
              oldVKid && oldVKid.node,
              oldVKid,
              newVKids[newHead],
              isSvg
            );
            newHead++;
          }
          oldHead++;
        } else {
          if (oldKey === newKey) {
            patchNode(
              node,
              oldVKid.node,
              oldVKid,
              newVKids[newHead],
              isSvg
            );
            newKeyed[newKey] = true;
            oldHead++;
          } else {
            if ((tmpVKid = keyed[newKey]) != null) {
              patchNode(
                node,
                node.insertBefore(tmpVKid.node, oldVKid && oldVKid.node),
                tmpVKid,
                newVKids[newHead],
                isSvg
              );
              newKeyed[newKey] = true;
            } else {
              patchNode(
                node,
                oldVKid && oldVKid.node,
                null,
                newVKids[newHead],
                isSvg
              );
            }
          }
          newHead++;
        }
      }

      while (oldHead <= oldTail) {
        if (getKey((oldVKid = oldVKids[oldHead++])) == null) {
          node.removeChild(oldVKid.node);
        }
      }

      for (var i in keyed) {
        if (newKeyed[i] == null) {
          node.removeChild(keyed[i].node);
        }
      }
    }
  }

  return (newVNode.node = node);
};

var propsChanged = (a, b) => {
  for (var k in a) if (a[k] !== b[k]) return true;
  for (var k in b) if (a[k] !== b[k]) return true;
};

var maybeVNode = (newVNode, oldVNode) =>
  newVNode !== true && newVNode !== false && newVNode
    ? typeof newVNode.tag === "function"
      ? ((!oldVNode ||
          oldVNode.memo == null ||
          propsChanged(oldVNode.memo, newVNode.memo)) &&
          ((oldVNode = newVNode.tag(newVNode.memo)).memo = newVNode.memo),
        oldVNode)
      : newVNode
    : text("");

var recycleNode = (node) =>
  node.nodeType === TEXT_NODE
    ? text(node.nodeValue, node)
    : createVNode(
        node.nodeName.toLowerCase(),
        EMPTY_OBJ,
        EMPTY_ARR.map.call(node.childNodes, recycleNode),
        SSR_NODE,
        node
      );

var createVNode = (tag, { key, ...props }, children, type, node) => ({
  tag,
  props,
  key,
  children,
  type,
  node,
});

var memo = (tag, memo) => ({ tag, memo });

var text = (value, node) =>
  createVNode(value, EMPTY_OBJ, EMPTY_ARR, TEXT_NODE, node);

var h = (tag, { class: c, ...props }, children = EMPTY_ARR) =>
  createVNode(
    tag,
    { ...props, ...(c ? { class: createClass(c) } : EMPTY_OBJ) },
    Array.isArray(children) ? children : [children]
  );

var patch = (node, vdom) => (
  ((node = patchNode(
    node.parentNode,
    node,
    node.vdom || recycleNode(node),
    vdom,
    false
  )).vdom = vdom),
  node
);
export { h, patch, text, memo };
