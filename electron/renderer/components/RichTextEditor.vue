<template>
  <div class="rte-wrapper">
    <div v-if="editor" class="rte-toolbar">
      <button
        type="button"
        title="撤销"
        aria-label="撤销"
        :disabled="!editor.can().undo()"
        @click="editor.chain().focus().undo().run()"
      >
        <svg viewBox="0 0 24 24">
          <path d="M9 7H4v5" />
          <path d="M4.5 11A8 8 0 1 0 7 5.5" />
        </svg>
      </button>
      <button
        type="button"
        title="重做"
        aria-label="重做"
        :disabled="!editor.can().redo()"
        @click="editor.chain().focus().redo().run()"
      >
        <svg viewBox="0 0 24 24">
          <path d="M15 7h5v5" />
          <path d="M19.5 11A8 8 0 1 1 17 5.5" />
        </svg>
      </button>
      <span class="sep"></span>
      <button
        type="button"
        title="加粗"
        aria-label="加粗"
        :class="{ active: editor.isActive('bold') }"
        @click="editor.chain().focus().toggleBold().run()"
      >
        <svg viewBox="0 0 24 24">
          <path d="M8 5h6a3 3 0 0 1 0 6H8z" />
          <path d="M8 11h7a4 4 0 0 1 0 8H8z" />
        </svg>
      </button>
      <button
        type="button"
        title="斜体"
        aria-label="斜体"
        :class="{ active: editor.isActive('italic') }"
        @click="editor.chain().focus().toggleItalic().run()"
      >
        <svg viewBox="0 0 24 24">
          <path d="M10 5h8" />
          <path d="M6 19h8" />
          <path d="M14 5l-4 14" />
        </svg>
      </button>
      <button
        type="button"
        title="下划线"
        aria-label="下划线"
        :class="{ active: editor.isActive('underline') }"
        @click="editor.chain().focus().toggleUnderline().run()"
      >
        <svg viewBox="0 0 24 24">
          <path d="M7 5v7a5 5 0 0 0 10 0V5" />
          <path d="M5 21h14" />
        </svg>
      </button>
      <button
        type="button"
        title="删除线"
        aria-label="删除线"
        :class="{ active: editor.isActive('strike') }"
        @click="editor.chain().focus().toggleStrike().run()"
      >
        <svg viewBox="0 0 24 24">
          <path d="M6 16a5 5 0 0 0 5 3h2a4 4 0 0 0 0-8h-2a4 4 0 0 1 0-8h2a5 5 0 0 1 5 3" />
          <path d="M4 12h16" />
        </svg>
      </button>
      <span class="sep"></span>
      <button
        type="button"
        title="正文"
        aria-label="正文"
        :class="{ active: editor.isActive('paragraph') }"
        @click="editor.chain().focus().setParagraph().run()"
      >
        <svg viewBox="0 0 24 24">
          <path d="M5 7h14" />
          <path d="M5 12h14" />
          <path d="M5 17h10" />
        </svg>
      </button>
      <button
        type="button"
        title="二级标题"
        :class="{ active: editor.isActive('heading', { level: 2 }) }"
        @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
      >
        H2
      </button>
      <button
        type="button"
        title="三级标题"
        :class="{ active: editor.isActive('heading', { level: 3 }) }"
        @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
      >
        H3
      </button>
      <span class="sep"></span>
      <button
        type="button"
        title="无序列表"
        aria-label="无序列表"
        :class="{ active: editor.isActive('bulletList') }"
        @click="editor.chain().focus().toggleBulletList().run()"
      >
        <svg viewBox="0 0 24 24">
          <path d="M9 7h10" />
          <path d="M9 12h10" />
          <path d="M9 17h10" />
          <path d="M5 7h.01" />
          <path d="M5 12h.01" />
          <path d="M5 17h.01" />
        </svg>
      </button>
      <button
        type="button"
        title="有序列表"
        aria-label="有序列表"
        :class="{ active: editor.isActive('orderedList') }"
        @click="editor.chain().focus().toggleOrderedList().run()"
      >
        <svg viewBox="0 0 24 24">
          <path d="M10 7h9" />
          <path d="M10 12h9" />
          <path d="M10 17h9" />
          <path d="M4 6h1v4" />
          <path d="M4 10h2" />
          <path d="M4 14h2l-2 3h2" />
        </svg>
      </button>
      <button
        type="button"
        title="引用"
        aria-label="引用"
        :class="{ active: editor.isActive('blockquote') }"
        @click="editor.chain().focus().toggleBlockquote().run()"
      >
        <svg viewBox="0 0 24 24">
          <path d="M8 7h4v4H9a4 4 0 0 0-4 4v2" />
          <path d="M17 7h4v4h-3a4 4 0 0 0-4 4v2" />
        </svg>
      </button>
      <span class="sep"></span>
      <button
        type="button"
        title="左对齐"
        aria-label="左对齐"
        :class="{ active: editor.isActive({ textAlign: 'left' }) }"
        @click="editor.chain().focus().setTextAlign('left').run()"
      >
        <svg viewBox="0 0 24 24">
          <path d="M4 6h16" />
          <path d="M4 10h10" />
          <path d="M4 14h16" />
          <path d="M4 18h10" />
        </svg>
      </button>
      <button
        type="button"
        title="居中对齐"
        aria-label="居中对齐"
        :class="{ active: editor.isActive({ textAlign: 'center' }) }"
        @click="editor.chain().focus().setTextAlign('center').run()"
      >
        <svg viewBox="0 0 24 24">
          <path d="M4 6h16" />
          <path d="M7 10h10" />
          <path d="M4 14h16" />
          <path d="M7 18h10" />
        </svg>
      </button>
      <button
        type="button"
        title="右对齐"
        aria-label="右对齐"
        :class="{ active: editor.isActive({ textAlign: 'right' }) }"
        @click="editor.chain().focus().setTextAlign('right').run()"
      >
        <svg viewBox="0 0 24 24">
          <path d="M4 6h16" />
          <path d="M10 10h10" />
          <path d="M4 14h16" />
          <path d="M10 18h10" />
        </svg>
      </button>
      <span class="sep"></span>
      <button
        type="button"
        title="链接"
        aria-label="链接"
        :class="{ active: editor.isActive('link') }"
        @click="setLink"
      >
        <svg viewBox="0 0 24 24">
          <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
          <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
        </svg>
      </button>
      <button
        type="button"
        title="分割线"
        aria-label="分割线"
        @click="editor.chain().focus().setHorizontalRule().run()"
      >
        <svg viewBox="0 0 24 24"><path d="M5 12h14" /></svg>
      </button>
    </div>
    <editor-content :editor="editor" class="rte-content" />
  </div>
</template>

<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'
import DOMPurify from 'dompurify'
import { watch } from 'vue'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

function sanitize(html: string): string {
  const cleaned = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'u',
      's',
      'h2',
      'h3',
      'ul',
      'ol',
      'li',
      'blockquote',
      'hr',
      'a'
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'style'],
    ALLOW_DATA_ATTR: false
  })
  const container = document.createElement('div')
  container.innerHTML = cleaned
  container.querySelectorAll<HTMLElement>('[style]').forEach((node) => {
    const align = node.style.textAlign
    if (['left', 'center', 'right'].includes(align)) {
      node.setAttribute('style', `text-align: ${align};`)
    } else {
      node.removeAttribute('style')
    }
  })
  return container.innerHTML
}

const editor = useEditor({
  content: props.modelValue ? sanitize(props.modelValue) : '',
  extensions: [
    StarterKit.configure({ heading: { levels: [2, 3] }, code: false, codeBlock: false }),
    Underline,
    Link.configure({ openOnClick: true, HTMLAttributes: { rel: 'noopener noreferrer' } }),
    TextAlign.configure({ types: ['heading', 'paragraph'] })
  ],
  onUpdate: ({ editor }) => emit('update:modelValue', sanitize(editor.getHTML()))
})

function setLink() {
  if (!editor.value) return
  const prevUrl = editor.value.getAttributes('link').href
  const url = window.prompt('链接地址', prevUrl ?? 'https://')
  if (url === null) return
  if (url === '') {
    editor.value.chain().focus().extendMarkRange('link').unsetLink().run()
  } else {
    editor.value.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }
}

watch(
  () => props.modelValue,
  (val) => {
    if (editor.value && val !== editor.value.getHTML()) editor.value.commands.setContent(val, { emitUpdate: false })
  }
)
</script>

<style>
.rte-wrapper {
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  width: 100%;
}
.rte-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-tertiary);
}
.rte-toolbar button {
  min-width: 26px;
  height: 24px;
  padding: 3px 6px;
  font-size: 12px;
  border-radius: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-primary);
}
.rte-toolbar button svg {
  width: 14px;
  height: 14px;
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.rte-toolbar button:hover {
  background: rgba(0, 0, 0, 0.06);
}
.rte-toolbar button:disabled {
  color: var(--text-tertiary);
  cursor: not-allowed;
  opacity: 0.45;
}
.rte-toolbar button:disabled:hover {
  background: transparent;
}
.rte-toolbar button.active {
  background: var(--accent);
  color: #fff;
}
.rte-toolbar .sep {
  width: 1px;
  margin: 0 4px;
  background: var(--border);
  align-self: stretch;
}

/* ── Content styles (isolated from Tailwind) ── */
.rte-content {
  padding: 12px;
  min-height: 120px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
}
.rte-content .ProseMirror {
  outline: none;
  min-height: 120px;
}
.rte-content .ProseMirror h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 6px;
  line-height: 1.35;
}
.rte-content .ProseMirror h3 {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 4px;
  line-height: 1.4;
}
.rte-content .ProseMirror p {
  margin: 0 0 8px;
}
.rte-content .ProseMirror p:last-child {
  margin-bottom: 0;
}
.rte-content .ProseMirror ul,
.rte-content .ProseMirror ol {
  padding-left: 24px;
  margin: 0 0 8px;
}
.rte-content .ProseMirror li {
  margin-bottom: 2px;
}
.rte-content .ProseMirror ul {
  list-style-type: disc;
}
.rte-content .ProseMirror ol {
  list-style-type: decimal;
}
.rte-content .ProseMirror blockquote {
  border-left: 3px solid var(--accent);
  margin: 0 0 8px;
  padding: 4px 12px;
  color: var(--text-secondary);
  background: var(--accent-light);
  border-radius: 0 4px 4px 0;
}
.rte-content .ProseMirror hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 12px 0;
}
.rte-content .ProseMirror a {
  color: var(--accent);
  text-decoration: underline;
  cursor: pointer;
}
.rte-content .ProseMirror a:hover {
  opacity: 0.8;
}
.rte-content .ProseMirror s {
  text-decoration: line-through;
}
.rte-content .ProseMirror u {
  text-decoration: underline;
}
</style>
