/*!
 * @traptitech/markdown-it-katex@3.6.0 - Fast math support for markdown-it with KaTeX
 * Copyright (c) 2023, traP (MIT)
 *
 * License for @traptitech/markdown-it-katex@3.6.0:
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2016 Waylon Flinn
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * ---
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2018 Takahiro Ethan Ikeuchi @iktakahiro
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * License for katex@0.16.8:
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2013-2020 Khan Academy and other contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/* Process inline math */
/*
Like markdown-it-simplemath, this is a stripped down, simplified version of:
https://github.com/runarberg/markdown-it-math

It differs in that it takes (a subset of) LaTeX as input and relies on KaTeX
for rendering output.
*/

/*jslint node: true */
'use strict';

var katex = require('katex');
import React from 'react';
import { renderToString } from 'react-dom/server';

// Test if potential opening or closing delimieter
// Assumes that there is a "$" at state.src[pos]
function isValidDelim(state, pos) {
  var prevChar, nextChar,
    max = state.posMax,
    can_open = true,
    can_close = true;

  prevChar = pos > 0 ? state.src.charCodeAt(pos - 1) : -1;
  nextChar = pos + 1 <= max ? state.src.charCodeAt(pos + 1) : -1;

  // Check non-whitespace conditions for opening and closing, and
  // check that closing delimeter isn't followed by a number
  if (prevChar === 0x20/* " " */ || prevChar === 0x09/* \t */ ||
    (nextChar >= 0x30/* "0" */ && nextChar <= 0x39/* "9" */)) {
    can_close = false;
  }
  if (nextChar === 0x20/* " " */ || nextChar === 0x09/* \t */) {
    can_open = false;
  }

  return {
    can_open: can_open,
    can_close: can_close
  };
}

function math_inline(state, silent) {
  var start, match, token, res, pos, esc_count;

  if (state.src[state.pos] !== "$") { return false; }

  res = isValidDelim(state, state.pos);
  if (!res.can_open) {
    if (!silent) { state.pending += "$"; }
    state.pos += 1;
    return true;
  }

  // First check for and bypass all properly escaped delimieters
  // This loop will assume that the first leading backtick can not
  // be the first character in state.src, which is known since
  // we have found an opening delimieter already.
  start = state.pos + 1;
  match = start;
  while ((match = state.src.indexOf("$", match)) !== -1) {
    // Found potential $, look for escapes, pos will point to
    // first non escape when complete
    pos = match - 1;
    while (state.src[pos] === "\\") { pos -= 1; }

    // Even number of escapes, potential closing delimiter found
    if (((match - pos) % 2) == 1) { break; }
    match += 1;
  }

  // No closing delimter found.  Consume $ and continue.
  if (match === -1) {
    if (!silent) { state.pending += "$"; }
    state.pos = start;
    return true;
  }

  // Check if we have empty content, ie: $$.  Do not parse.
  if (match - start === 0) {
    if (!silent) { state.pending += "$$"; }
    state.pos = start + 1;
    return true;
  }

  // Check for valid closing delimiter
  res = isValidDelim(state, match);
  if (!res.can_close) {
    if (!silent) { state.pending += "$"; }
    state.pos = start;
    return true;
  }

  if (!silent) {
    token = state.push('math_inline', 'math', 0);
    token.markup = "$";
    token.content = state.src.slice(start, match);
  }

  state.pos = match + 1;
  return true;
}

function math_block(state, start, end, silent) {
  var firstLine, lastLine, next, lastPos, found = false, token,
    pos = state.bMarks[start] + state.tShift[start],
    max = state.eMarks[start]

  if (pos + 2 > max) { return false; }
  if (state.src.slice(pos, pos + 2) !== '$$') { return false; }

  pos += 2;
  firstLine = state.src.slice(pos, max);

  if (silent) { return true; }
  if (firstLine.trim().slice(-2) === '$$') {
    // Single line expression
    firstLine = firstLine.trim().slice(0, -2);
    found = true;
  }

  for (next = start; !found;) {

    next++;

    if (next >= end) { break; }

    pos = state.bMarks[next] + state.tShift[next];
    max = state.eMarks[next];

    if (pos < max && state.tShift[next] < state.blkIndent) {
      // non-empty line with negative indent should stop the list:
      break;
    }

    if (state.src.slice(pos, max).trim().slice(-2) === '$$') {
      lastPos = state.src.slice(0, max).lastIndexOf('$$');
      lastLine = state.src.slice(pos, lastPos);
      found = true;
    }

  }

  state.line = next + 1;

  token = state.push('math_block', 'math', 0);
  token.block = true;
  token.content = (firstLine && firstLine.trim() ? firstLine + '\n' : '')
    + state.getLines(start + 1, next, state.tShift[start], true)
    + (lastLine && lastLine.trim() ? lastLine : '');
  token.map = [start, state.line];
  token.markup = '$$';
  return true;
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function unescapeHtml(unsafe) {
  return unsafe
    .replace(/&amp;/g, "\&")
    .replace(/&lt;/g, "\<")
    .replace(/&gt;/g, "\>")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "\'");
}

export default function math_plugin(md, options) {
  // Default options

  options = options || {};
  if (options.katex) {
    katex = options.katex;
  }
  if (!options.blockClass) {
    options.blockClass = ""
  }

  // set KaTeX as the renderer for markdown-it-simplemath
  var katexInline = function (latex) {
    latex = unescapeHtml(latex); // work with QQNT Markdown-it
    options.displayMode = false;
    try {
      return katex.renderToString(latex, options);
    }
    catch (error) {
      if (options.throwOnError) { console.log(error); }
      return `<span class='katex-error' title='${escapeHtml(error.toString())}'>${escapeHtml(latex)}</span>`;
    }
  };

  var inlineRenderer = function (tokens, idx) {
    return katexInline(tokens[idx].content);
  };

  var katexBlock = function (latex) {
    latex = unescapeHtml(latex); // work with QQNT Markdown-it
    options.displayMode = true;
    try {
      // return `<p class="katex-block katex_rendered ${options.blockClass}">` + katex.renderToString(latex, options) + "</p>";
      return renderToString(<KatexBlockComponent latex={latex} options={options} />);
    }
    catch (error) {
      if (options.throwOnError) { console.log(error); }
      return `<p class='katex-block katex-error ${options.blockClass
        }' title='${escapeHtml(error.toString())}'>${escapeHtml(latex)}</p>`;
    }
  }

  var blockRenderer = function (tokens, idx) {
    return katexBlock(tokens[idx].content) + '\n';
  }


  md.inline.ruler.after('escape', 'math_inline', math_inline);
  md.block.ruler.after('blockquote', 'math_block', math_block, {
    alt: ['paragraph', 'reference', 'blockquote', 'list']
  });
  md.renderer.rules.math_inline = inlineRenderer;
  md.renderer.rules.math_block = blockRenderer;
};


function KatexBlockComponent({ latex, options }) {
  return (
    <div className='katex-block-rendered'>
      <button className='copy_latex'>复制公式</button>
      <p className='katex-block' dangerouslySetInnerHTML={{ __html: katex.renderToString(latex, options) }}></p>
    </div>
  );
}