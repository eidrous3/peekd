// Peekd dashboard — lightweight rich-text editor (contenteditable based).
// Reused in Compose, Campaign sequence steps, and AI Edit & Send.
(function () {
  const { useRef, useState, useEffect } = React;
  const Icon = window.Icon;
  const MERGE_TAGS = ['first_name', 'last_name', 'company', 'email'];

  function RichEditor({ value = '', onChange, minHeight = 160, mergeTags = false, placeholder = 'Write your message…' }) {
    const ref = useRef(null);
    const fileRef = useRef(null);
    const savedRange = useRef(null);
    const [active, setActive] = useState({});
    const [empty, setEmpty] = useState(true);
    const [linkOpen, setLinkOpen] = useState(false);
    const [linkUrl, setLinkUrl] = useState('');
    const [tracked, setTracked] = useState(false);
    const [tagsOpen, setTagsOpen] = useState(false);
    const [imgErr, setImgErr] = useState('');

    const checkEmpty = () => !ref.current.textContent.trim() && !ref.current.querySelector('img, li');

    useEffect(() => {
      if (ref.current) { ref.current.innerHTML = value || ''; setEmpty(checkEmpty()); }
    }, []);

    const emit = () => { setEmpty(checkEmpty()); onChange && onChange(ref.current.innerHTML); };

    const saveSel = () => {
      const s = window.getSelection();
      if (s.rangeCount && ref.current.contains(s.anchorNode)) savedRange.current = s.getRangeAt(0).cloneRange();
    };
    const restoreSel = () => {
      ref.current.focus();
      if (savedRange.current) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(savedRange.current); }
    };

    const refreshActive = () => {
      const sel = window.getSelection();
      if (!ref.current || !sel.anchorNode || !ref.current.contains(sel.anchorNode)) return;
      setActive({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        ul: document.queryCommandState('insertUnorderedList'),
        ol: document.queryCommandState('insertOrderedList'),
      });
    };

    useEffect(() => {
      const h = () => refreshActive();
      document.addEventListener('selectionchange', h);
      return () => document.removeEventListener('selectionchange', h);
    }, []);

    const exec = (cmd, val) => { ref.current.focus(); document.execCommand(cmd, false, val == null ? null : val); refreshActive(); emit(); };

    const openLink = () => { saveSel(); setLinkUrl(''); setTagsOpen(false); setLinkOpen(true); };
    const addLink = () => {
      let url = linkUrl.trim();
      if (!url) { setLinkOpen(false); return; }
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      restoreSel();
      const sel = window.getSelection();
      if (sel.isCollapsed) document.execCommand('insertHTML', false, '<a href="' + url + '">' + url + '</a>&nbsp;');
      else document.execCommand('createLink', false, url);
      setLinkOpen(false); setLinkUrl('');
      setTracked(true); clearTimeout(window.__reTrackT); window.__reTrackT = setTimeout(() => setTracked(false), 2600);
      emit();
    };

    const insertTag = (t) => {
      restoreSel();
      document.execCommand('insertHTML', false, '<span class="merge-pill" contenteditable="false" data-tag="' + t + '">{{' + t + '}}</span>&nbsp;');
      setTagsOpen(false); emit();
    };

    const onImage = (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) { setImgErr('Image too large — max 5MB'); setTimeout(() => setImgErr(''), 2600); return; }
      const rd = new FileReader();
      rd.onload = () => { restoreSel(); document.execCommand('insertHTML', false, '<img src="' + rd.result + '" alt="">'); emit(); };
      rd.readAsDataURL(f);
    };

    const onKeyDown = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openLink(); } };

    const Btn = (name, label, onClick, isActive) =>
      React.createElement('button', { type: 'button', className: 're-btn' + (isActive ? ' on' : ''), title: label, onMouseDown: e => e.preventDefault(), onClick },
        React.createElement(Icon, { name, size: 15 }));
    const Sep = (k) => React.createElement('span', { key: k, className: 're-divider' });

    return React.createElement('div', { className: 'rich-editor-wrapper' },
      React.createElement('div', { className: 'rich-editor-toolbar' },
        Btn('bold', 'Bold (⌘B)', () => exec('bold'), active.bold),
        Btn('italic', 'Italic (⌘I)', () => exec('italic'), active.italic),
        Btn('underline', 'Underline (⌘U)', () => exec('underline'), active.underline),
        Sep('s1'),
        React.createElement('div', { className: 're-pop-wrap' },
          Btn('link', 'Insert link (⌘K)', openLink, linkOpen),
          linkOpen && React.createElement('div', { className: 're-link-pop', onMouseDown: e => e.stopPropagation() },
            React.createElement('input', { className: 'input', autoFocus: true, placeholder: 'https://', value: linkUrl,
              onChange: e => setLinkUrl(e.target.value), onKeyDown: e => { if (e.key === 'Enter') addLink(); if (e.key === 'Escape') setLinkOpen(false); } }),
            React.createElement('button', { className: 'btn btn-primary btn-sm', onMouseDown: e => e.preventDefault(), onClick: addLink }, 'Add')),
        ),
        Sep('s2'),
        Btn('listBullet', 'Bullet list', () => exec('insertUnorderedList'), active.ul),
        Btn('listOrdered', 'Numbered list', () => exec('insertOrderedList'), active.ol),
        Sep('s3'),
        Btn('image', 'Insert image', () => { saveSel(); fileRef.current.click(); }),
        mergeTags && Sep('s4'),
        mergeTags && React.createElement('div', { className: 're-pop-wrap' },
          Btn('braces', 'Merge tags', () => { saveSel(); setLinkOpen(false); setTagsOpen(o => !o); }, tagsOpen),
          tagsOpen && React.createElement('div', { className: 're-tags-pop', onMouseDown: e => e.stopPropagation() },
            MERGE_TAGS.map(t => React.createElement('button', { key: t, type: 'button', className: 're-tag-opt', onMouseDown: e => e.preventDefault(), onClick: () => insertTag(t) }, '{{' + t + '}}')))),
        React.createElement('input', { ref: fileRef, type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', style: { display: 'none' }, onChange: onImage }),
      ),
      tracked && React.createElement('div', { className: 're-note re-tracked' }, React.createElement(Icon, { name: 'check', size: 12 }), 'Link will be tracked by Peekd'),
      imgErr && React.createElement('div', { className: 're-note re-img-err' }, imgErr),
      React.createElement('div', { className: 'rich-editor-content-wrap' },
        empty && React.createElement('div', { className: 're-placeholder' }, placeholder),
        React.createElement('div', {
          ref, className: 'rich-editor-content', contentEditable: true, suppressContentEditableWarning: true,
          style: { minHeight }, onInput: emit, onKeyUp: refreshActive, onMouseUp: refreshActive, onKeyDown, onBlur: saveSel,
        }),
      ),
    );
  }

  window.RichEditor = RichEditor;
})();
