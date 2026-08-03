'use client'

import { useEditor, EditorContent, Extension } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import Link from '@tiptap/extension-link'
import FontFamily from '@tiptap/extension-font-family'
import { Node, Mark, mergeAttributes } from '@tiptap/core'
import {
  Bold, Italic, Underline as UnderlineIcon, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Table as TableIcon, Image as ImageIcon, List, ListOrdered, Undo, Redo,
  Link as LinkIcon, Strikethrough, Highlighter, Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon, Minus, IndentIncrease, IndentDecrease,
  Type, Palette, SeparatorHorizontal, Upload, LayoutGrid,
} from 'lucide-react'
import { forwardRef, useImperativeHandle, useEffect, useRef, useState } from 'react'
import { useDialogen } from '@/components/ui/dialogen'

// ─── FontSize via TextStyle ───────────────────────────────────────────────────

const FontSizeMark = Mark.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: el => (el as HTMLElement).style.fontSize?.replace('pt', '') || null,
          renderHTML: attrs => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}pt` } : {},
        },
      },
    }]
  },
  addCommands() {
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setFontSize: (fontSize: string) => ({ chain }: any) => chain().setMark('textStyle', { fontSize }).run(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unsetFontSize: () => ({ chain }: any) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    } as never
  },
})

// ─── Tab-handler ──────────────────────────────────────────────────────────────

const TabHandler = Extension.create({
  name: 'tabHandler',
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        if (editor.isActive('listItem')) return editor.commands.sinkListItem('listItem')
        editor.commands.insertContent('\u00a0\u00a0\u00a0\u00a0')
        return true
      },
      'Shift-Tab': ({ editor }) => {
        if (editor.isActive('listItem')) return editor.commands.liftListItem('listItem')
        return false
      },
    }
  },
})

// ─── Pagina-einde node ────────────────────────────────────────────────────────

const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,

  parseHTML() {
    return [{ tag: 'div[data-page-break]' }]
  },

  renderHTML() {
    return ['div', { 'data-page-break': 'true', class: 'wysiwyg-page-break' }]
  },

  addNodeView() {
    return () => {
      const dom = document.createElement('div')
      dom.className = 'wysiwyg-page-break-view'
      dom.contentEditable = 'false'
      dom.innerHTML = '<span>― Pagina-einde ―</span>'
      return { dom }
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Enter': ({ editor }) =>
        editor.commands.insertContent({ type: 'pageBreak' }),
    }
  },
})

// ─── CalcBlok node ────────────────────────────────────────────────────────────

const CALC_KOLOM_LABELS: Record<string, string> = {
  omschrijving: 'Omschrijving',
  eenheid: 'Eenheid',
  aantal: 'Aantal',
  prijs: 'Prijs p/e',
  totaal: 'Totaal',
  btw: 'BTW %',
  marge: 'Marge %',
}

const CalcBlok = Node.create({
  name: 'calcBlok',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      kolommen: { default: 'omschrijving,eenheid,aantal,prijs,totaal' },
    }
  },

  parseHTML() {
    return [{
      tag: 'div[data-calc-blok]',
      getAttrs: el => ({
        kolommen: (el as HTMLElement).getAttribute('data-calc-blok') ?? 'omschrijving,eenheid,aantal,prijs,totaal',
      }),
    }]
  },

  renderHTML({ node }) {
    return ['div', { 'data-calc-blok': node.attrs.kolommen, class: 'calc-blok-placeholder' }]
  },

  addNodeView() {
    return ({ node }) => {
      const kols: string[] = node.attrs.kolommen.split(',').filter(Boolean)
      const dom = document.createElement('div')
      dom.className = 'wysiwyg-calc-blok-view'
      dom.contentEditable = 'false'
      dom.innerHTML = `
        <span class="calc-blok-icon">⊞</span>
        <span class="calc-blok-title">Calculatieregels</span>
        <span class="calc-blok-cols">${kols.map(k => CALC_KOLOM_LABELS[k] ?? k).join(' · ')}</span>
      `
      return { dom }
    }
  },
})

// ─── Afbeelding met grootte & uitlijning ──────────────────────────────────────

const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: el => (el as HTMLElement).style.width || null,
        renderHTML: attrs => attrs.width ? { style: `width: ${attrs.width}; max-width: 100%;` } : { style: 'max-width: 100%;' },
      },
      align: {
        default: 'center',
        parseHTML: el => (el as HTMLElement).getAttribute('data-align') ?? 'center',
        renderHTML: attrs => ({ 'data-align': attrs.align ?? 'center' }),
      },
    }
  },
})

// ─── HbVar node ───────────────────────────────────────────────────────────────

const HbVar = Node.create({
  name: 'hbVar',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return { v: { default: '' } }
  },

  parseHTML() {
    return [{
      tag: 'span[data-hb-var]',
      getAttrs: el => ({ v: (el as HTMLElement).getAttribute('data-hb-var') ?? '' }),
    }]
  },

  renderHTML({ node }) {
    return ['span', mergeAttributes({
      'data-hb-var': node.attrs.v,
      class: 'hb-var',
      contenteditable: 'false',
    }), `{{${node.attrs.v}}}`]
  },
})

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WysiwygEditorRef {
  insertVariable: (variable: string) => void
  insertHtml: (html: string) => void
  getHtml: () => string
}

export interface DocumentStyle {
  fontFamily?: string
  fontSize?: number
  marginTop?: number
  marginBottom?: number
  marginLeft?: number
  marginRight?: number
  paperFormat?: 'A4' | 'A3'
  paperOrientation?: 'portrait' | 'landscape'
  primaryColor?: string
}

interface Props {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  documentStyle?: DocumentStyle
  footer?: string
  onFooterChange?: (v: string) => void
}

// ─── Constanten ───────────────────────────────────────────────────────────────

const FONTS = [
  { label: 'Standaard', value: '' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Calibri', value: 'Calibri, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Helvetica', value: 'Helvetica, sans-serif' },
  { label: 'Times New Roman', value: 'Times New Roman, serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Courier New', value: 'Courier New, monospace' },
]

const FONT_SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '36', '48']

const KLEUREN = [
  '#000000', '#1e293b', '#334155', '#64748b', '#94a3b8',
  '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2',
  '#2563eb', '#7c3aed', '#db2777',
  '#ffffff', '#fef2f2', '#fefce8', '#f0fdf4', '#eff6ff',
]

const MM_TO_PX = 3.7795

// ─── Component ───────────────────────────────────────────────────────────────

const WysiwygEditor = forwardRef<WysiwygEditorRef, Props>(
  ({ content, onChange, placeholder = 'Begin met typen...', documentStyle, footer, onFooterChange }, ref) => {

  const [colorPickerOpen, setColorPickerOpen] = useState<'tekst' | 'markeer' | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const ds = documentStyle
  const isDocMode = !!ds
  const paperW = ds?.paperFormat === 'A3'
    ? (ds.paperOrientation === 'landscape' ? 420 : 297)
    : (ds?.paperOrientation === 'landscape' ? 297 : 210)
  const pageWidthPx = Math.round(paperW * MM_TO_PX)
  const padTop    = Math.round((ds?.marginTop    ?? 20) * MM_TO_PX)
  const padBottom = Math.round((ds?.marginBottom ?? 20) * MM_TO_PX)
  const padLeft   = Math.round((ds?.marginLeft   ?? 18) * MM_TO_PX)
  const padRight  = Math.round((ds?.marginRight  ?? 18) * MM_TO_PX)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Table.configure({ resizable: true }),
      TableRow, TableHeader, TableCell,
      ResizableImage.configure({ allowBase64: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle, Color, FontFamily, FontSizeMark,
      Underline, Highlight.configure({ multicolor: true }),
      Subscript, Superscript,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'wysiwyg-link' } }),
      TabHandler,
      PageBreak,
      CalcBlok,
      HbVar,
    ],
    content,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'wysiwyg-prosemirror', 'data-placeholder': placeholder },
    },
    onUpdate({ editor }) { onChange(editor.getHTML()) },
  })

  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      const current = editor.getHTML()
      if (content !== current) editor.commands.setContent(content)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  useImperativeHandle(ref, () => ({
    insertVariable: (variable) => {
      if (!editor || editor.isDestroyed) return
      editor.commands.insertContent({ type: 'hbVar', attrs: { v: variable } })
      editor.commands.focus()
    },
    insertHtml: (html) => {
      if (!editor || editor.isDestroyed) return
      editor.commands.insertContent(html)
      editor.commands.focus()
    },
    getHtml: () => editor?.getHTML() ?? '',
  }))

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('.color-picker-wrap')) setColorPickerOpen(null)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const { vraagTekst } = useDialogen()

  if (!editor) return <div className="flex-1 bg-white" />

  // Afbeelding geselecteerd?
  const isImageSelected = editor.isActive('image')
  const imgAttrs = isImageSelected ? editor.getAttributes('image') : null

  const isInTable = editor.isActive('table')
  const huidigFont = FONTS.find(f => f.value && editor.isActive('textStyle', { fontFamily: f.value }))?.value ?? ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const huidigSize = (editor.getAttributes('textStyle') as any)?.fontSize ?? ''

  async function handleLink() {
    if (!editor) return
    const bestaand = editor.getAttributes('link').href ?? ''
    const url = await vraagTekst({
      titel: 'Link toevoegen',
      omschrijving: 'Laat het veld leeg om de link te verwijderen.',
      label: 'URL',
      standaard: bestaand,
      placeholder: 'https://…',
      bevestigLabel: 'Toepassen',
    })
    if (url === null) return
    if (url === '') editor.chain().focus().unsetLink().run()
    else editor.chain().focus().setLink({ href: url, target: '_blank' }).run()
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    const reader = new FileReader()
    reader.onload = ev => {
      const src = ev.target?.result as string
      if (src) editor.chain().focus().setImage({ src } as never).run()
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function handleImageUrl() {
    if (!editor) return
    const url = await vraagTekst({
      titel: 'Afbeelding via URL',
      label: 'URL van de afbeelding',
      placeholder: 'https://…',
      verplicht: true,
      bevestigLabel: 'Invoegen',
    })
    if (url) editor.chain().focus().setImage({ src: url } as never).run()
  }

  function updateImg(attrs: Record<string, string>) {
    if (!editor) return
    editor.chain().focus().updateAttributes('image', attrs).run()
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">

      {/* ── Werkbalk rij 1 ───────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-slate-50">
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b border-slate-100">
          {/* Lettertype */}
          <select
            value={huidigFont}
            onChange={e => { e.preventDefault(); e.target.value === '' ? editor.chain().focus().unsetFontFamily().run() : editor.chain().focus().setFontFamily(e.target.value).run() }}
            className="h-6 px-1 text-xs border border-slate-200 rounded bg-white text-slate-700 focus:outline-none max-w-[110px]"
            title="Lettertype"
          >
            {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>

          {/* Lettergrootte */}
          <select
            value={huidigSize}
            onChange={e => {
              e.preventDefault()
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              e.target.value ? (editor.chain().focus() as any).setFontSize(e.target.value).run() : (editor.chain().focus() as any).unsetFontSize().run()
            }}
            className="h-6 w-14 px-1 text-xs border border-slate-200 rounded bg-white text-slate-700 focus:outline-none"
            title="Grootte (pt)"
          >
            <option value="">–</option>
            {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <Sep />
          <TB onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Vet"><Bold className="w-3.5 h-3.5" /></TB>
          <TB onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Cursief"><Italic className="w-3.5 h-3.5" /></TB>
          <TB onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Onderstrepen"><UnderlineIcon className="w-3.5 h-3.5" /></TB>
          <TB onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Doorhalen"><Strikethrough className="w-3.5 h-3.5" /></TB>
          <Sep />

          {/* Tekstkleur */}
          <div className="relative color-picker-wrap">
            <button type="button" onMouseDown={e => { e.preventDefault(); setColorPickerOpen(v => v === 'tekst' ? null : 'tekst') }} title="Tekstkleur" className="flex flex-col items-center p-1.5 rounded text-slate-500 hover:bg-slate-100 transition-colors">
              <Type className="w-3.5 h-3.5" />
              <div className="w-3.5 h-1 rounded-sm mt-0.5" style={{ backgroundColor: editor.getAttributes('textStyle').color ?? '#000' }} />
            </button>
            {colorPickerOpen === 'tekst' && <ColorPicker title="Tekstkleur" onSelect={k => { editor.chain().focus().setColor(k).run(); setColorPickerOpen(null) }} onClear={() => { editor.chain().focus().unsetColor().run(); setColorPickerOpen(null) }} />}
          </div>

          {/* Markering */}
          <div className="relative color-picker-wrap">
            <button type="button" onMouseDown={e => { e.preventDefault(); setColorPickerOpen(v => v === 'markeer' ? null : 'markeer') }} title="Markeerkleur" className="flex flex-col items-center p-1.5 rounded text-slate-500 hover:bg-slate-100 transition-colors">
              <Highlighter className="w-3.5 h-3.5" />
              <div className="w-3.5 h-1 rounded-sm mt-0.5" style={{ backgroundColor: editor.getAttributes('highlight').color ?? '#fef08a' }} />
            </button>
            {colorPickerOpen === 'markeer' && <ColorPicker title="Markeerkleur" onSelect={k => { editor.chain().focus().toggleHighlight({ color: k }).run(); setColorPickerOpen(null) }} onClear={() => { editor.chain().focus().unsetHighlight().run(); setColorPickerOpen(null) }} />}
          </div>

          <Sep />
          <TB onClick={() => editor.chain().focus().toggleSuperscript().run()} active={editor.isActive('superscript')} title="Superscript"><SuperscriptIcon className="w-3.5 h-3.5" /></TB>
          <TB onClick={() => editor.chain().focus().toggleSubscript().run()} active={editor.isActive('subscript')} title="Subscript"><SubscriptIcon className="w-3.5 h-3.5" /></TB>
          <Sep />
          <TB onClick={() => editor.chain().focus().undo().run()} title="Ongedaan maken"><Undo className="w-3.5 h-3.5" /></TB>
          <TB onClick={() => editor.chain().focus().redo().run()} title="Opnieuw"><Redo className="w-3.5 h-3.5" /></TB>
        </div>

        {/* ── Werkbalk rij 2 ─────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1">
          <TB onClick={() => editor.chain().focus().setParagraph().run()} active={editor.isActive('paragraph') && !editor.isActive('heading')} title="Alinea"><span className="text-xs font-medium px-0.5">¶</span></TB>
          <TB onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Kop 1"><span className="text-xs font-bold">H1</span></TB>
          <TB onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Kop 2"><span className="text-xs font-bold">H2</span></TB>
          <TB onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Kop 3"><span className="text-xs font-bold">H3</span></TB>
          <Sep />
          <TB onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Links"><AlignLeft className="w-3.5 h-3.5" /></TB>
          <TB onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Midden"><AlignCenter className="w-3.5 h-3.5" /></TB>
          <TB onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Rechts"><AlignRight className="w-3.5 h-3.5" /></TB>
          <TB onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} title="Uitvullen"><AlignJustify className="w-3.5 h-3.5" /></TB>
          <Sep />
          <TB onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Lijst"><List className="w-3.5 h-3.5" /></TB>
          <TB onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Genummerde lijst"><ListOrdered className="w-3.5 h-3.5" /></TB>
          <TB onClick={() => { if (editor.isActive('listItem')) editor.chain().focus().sinkListItem('listItem').run(); else { editor.commands.insertContent('\u00a0\u00a0\u00a0\u00a0'); editor.commands.focus() } }} title="Inspringing +"><IndentIncrease className="w-3.5 h-3.5" /></TB>
          <TB onClick={() => { if (editor.isActive('listItem')) editor.chain().focus().liftListItem('listItem').run() }} title="Inspringing -"><IndentDecrease className="w-3.5 h-3.5" /></TB>
          <Sep />
          <TB onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Tabel invoegen"><TableIcon className="w-3.5 h-3.5" /></TB>

          {isInTable && (
            <>
              <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().addRowAfter().run() }} className="px-1.5 py-1 text-xs rounded text-slate-500 hover:bg-slate-100">+rij</button>
              <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().addColumnAfter().run() }} className="px-1.5 py-1 text-xs rounded text-slate-500 hover:bg-slate-100">+kol</button>
              <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteRow().run() }} className="px-1.5 py-1 text-xs rounded text-red-400 hover:bg-red-50">−rij</button>
              <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteColumn().run() }} className="px-1.5 py-1 text-xs rounded text-red-400 hover:bg-red-50">−kol</button>
              <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteTable().run() }} className="px-1.5 py-1 text-xs rounded text-red-400 hover:bg-red-50">✕ tabel</button>
            </>
          )}

          {/* Afbeelding uploaden */}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          <TB onClick={() => fileInputRef.current?.click()} title="Afbeelding uploaden (bestand)"><Upload className="w-3.5 h-3.5" /></TB>
          <TB onClick={handleImageUrl} title="Afbeelding via URL"><ImageIcon className="w-3.5 h-3.5" /></TB>

          <TB onClick={handleLink} active={editor.isActive('link')} title="Hyperlink"><LinkIcon className="w-3.5 h-3.5" /></TB>
          <TB onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontale lijn"><Minus className="w-3.5 h-3.5" /></TB>
          <TB
            onClick={() => editor.commands.insertContent({ type: 'pageBreak' })}
            title="Pagina-einde invoegen (Ctrl+Enter)"
          >
            <SeparatorHorizontal className="w-3.5 h-3.5" />
          </TB>
        </div>

        {/* ── Afbeelding-toolbar (alleen als afbeelding geselecteerd) ─── */}
        {isImageSelected && imgAttrs && (
          <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 bg-blue-50 border-t border-blue-100">
            <LayoutGrid className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
            <span className="text-xs font-medium text-blue-600 mr-1">Afbeelding:</span>

            {/* Uitlijning */}
            <TB onClick={() => updateImg({ align: 'left' })} active={imgAttrs.align === 'left'} title="Float links"><AlignLeft className="w-3.5 h-3.5" /></TB>
            <TB onClick={() => updateImg({ align: 'center' })} active={!imgAttrs.align || imgAttrs.align === 'center'} title="Centreer"><AlignCenter className="w-3.5 h-3.5" /></TB>
            <TB onClick={() => updateImg({ align: 'right' })} active={imgAttrs.align === 'right'} title="Float rechts"><AlignRight className="w-3.5 h-3.5" /></TB>

            <Sep />

            {/* Breedte presets */}
            {['25%', '33%', '50%', '66%', '75%', '100%'].map(w => (
              <button
                key={w}
                type="button"
                onMouseDown={e => { e.preventDefault(); updateImg({ width: w }) }}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${imgAttrs.width === w ? 'bg-blue-200 text-blue-800 font-medium' : 'bg-white text-slate-500 border border-slate-200 hover:border-blue-300'}`}
              >
                {w}
              </button>
            ))}

            <Sep />

            {/* Aangepaste breedte */}
            <span className="text-xs text-slate-400">of:</span>
            <input
              type="text"
              defaultValue={imgAttrs.width ?? ''}
              placeholder="bv. 200px"
              className="h-6 w-20 px-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-300"
              onBlur={e => { if (e.target.value) updateImg({ width: e.target.value }) }}
              onKeyDown={e => { if (e.key === 'Enter') { updateImg({ width: (e.target as HTMLInputElement).value }); e.currentTarget.blur() } }}
            />

            <Sep />
            <button type="button" onMouseDown={e => { e.preventDefault(); editor.commands.deleteSelection() }} className="px-2 py-0.5 text-xs rounded bg-red-50 text-red-500 border border-red-200 hover:bg-red-100 transition-colors">
              Verwijderen
            </button>
          </div>
        )}
      </div>

      {/* ── Document-inhoud ───────────────────────────────────────────── */}
      {isDocMode ? (
        <div className="flex-1 overflow-auto wysiwyg-doc-scroll">
          <div
            className="wysiwyg-doc-page"
            style={{ width: pageWidthPx, fontFamily: ds?.fontFamily || 'system-ui, sans-serif', fontSize: `${ds?.fontSize ?? 10}pt` }}
          >
            {/* Hoofdinhoud met paginamarges */}
            <div style={{ padding: `${padTop}px ${padRight}px ${padBottom}px ${padLeft}px`, minHeight: 800 }}>
              <EditorContent editor={editor} />
            </div>

            {/* Voettekst */}
            {footer !== undefined && (
              <div className="wysiwyg-doc-footer-zone">
                <div className="wysiwyg-doc-zone-label">Voettekst</div>
                <input
                  type="text"
                  value={footer}
                  onChange={e => onFooterChange?.(e.target.value)}
                  placeholder="Bijv. Pagina {{paginanummer}} van {{totaal_paginas}} · {{bedrijf.naam}}"
                  className="wysiwyg-doc-zone-input"
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto wysiwyg-editor-wrap">
          <EditorContent editor={editor} />
        </div>
      )}
    </div>
  )
})

WysiwygEditor.displayName = 'WysiwygEditor'

// ─── Kleurpicker ──────────────────────────────────────────────────────────────

function ColorPicker({ title, onSelect, onClear }: { title: string; onSelect: (k: string) => void; onClear: () => void }) {
  return (
    <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-2 w-44">
      <p className="text-xs font-medium text-slate-500 mb-1.5">{title}</p>
      <div className="grid grid-cols-9 gap-1 mb-2">
        {KLEUREN.map(k => (
          <button key={k} type="button" onMouseDown={e => { e.preventDefault(); onSelect(k) }}
            className="w-4 h-4 rounded-sm border border-slate-200 hover:scale-110 transition-transform"
            style={{ backgroundColor: k }} title={k}
          />
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer">
          <Palette className="w-3 h-3" /> Aangepast:
          <input type="color" className="w-6 h-5 cursor-pointer border-0 p-0 rounded" onChange={e => onSelect(e.target.value)} />
        </label>
        <button type="button" onMouseDown={e => { e.preventDefault(); onClear() }} className="ml-auto text-xs text-slate-400 hover:text-slate-600">Wissen</button>
      </div>
    </div>
  )
}

// ─── Hulpcomponenten ──────────────────────────────────────────────────────────

function TB({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      title={title}
      className={`p-1.5 rounded transition-colors ${active ? 'bg-everts/10 text-everts' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
    >
      {children}
    </button>
  )
}

function Sep() {
  return <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />
}

export default WysiwygEditor
