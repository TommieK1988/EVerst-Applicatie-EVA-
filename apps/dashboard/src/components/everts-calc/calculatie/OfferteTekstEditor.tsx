'use client'

/**
 * Opgemaakt tekstveld voor de offerte: vet, cursief, onderstreept en opsommingen.
 *
 * Bewust klein gehouden. Er ligt al een `WysiwygEditor` in de codebase, maar die komt
 * uit het tijdperk dat de offerte in HTML werd opgemaakt en kan tabellen, kleuren,
 * lettertypen en paginabreuken — allemaal dingen die de Word-render niet overneemt.
 * Alleen aanbieden wat er ook echt in de offerte terechtkomt, anders belooft de knop
 * iets wat de PDF niet waarmaakt.
 *
 * De waarde is HTML; `lib/everts-calc/html-naar-ooxml.ts` zet dezelfde subset om naar
 * Word-XML.
 */

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef } from 'react'
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Undo2, Redo2 } from 'lucide-react'
import { cn } from '@everts/ui'

interface Props {
  waarde: string
  onChange: (html: string) => void
  readOnly?: boolean
  placeholder?: string
}

/** Lege editor levert `<p></p>`; dat is geen inhoud. */
function leeg(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').trim() === ''
}

export default function OfferteTekstEditor({ waarde, onChange, readOnly = false, placeholder }: Props) {
  // Laatste waarde die wij zelf naar buiten meldden. Zonder deze vergelijking zet de
  // synchronisatie hieronder de cursor bij elke toetsaanslag terug naar het begin.
  const eigenHtml = useRef(waarde)

  const editor = useEditor({
    // Server-render van deze editor overslaan: Tiptap waarschuwt anders over een
    // hydratatieverschil, en het veld heeft pas in de browser nut.
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        heading: false,        // koppen zou het sjabloon toch platslaan
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      // Underline zit al in StarterKit 3 — los toevoegen geeft
      // "Duplicate extension names found: ['underline']".
    ],
    content: waarde || '',
    editorProps: {
      attributes: {
        // Geen `prose`: het typography-plugin staat niet in deze build, dus die klasse
        // doet niets en lijsten zouden zonder bolletje in beeld staan. Daarom expliciet.
        class: [
          'min-h-[420px] px-6 py-5 leading-relaxed text-sm text-slate-700 focus:outline-none',
          '[&_p]:my-2 [&_p:first-child]:mt-0',
          '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6',
          '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6',
          '[&_li]:my-0.5 [&_li>p]:my-0',
          '[&_strong]:font-semibold',
        ].join(' '),
      },
    },
    onUpdate({ editor }) {
      const html = leeg(editor.getHTML()) ? '' : editor.getHTML()
      eigenHtml.current = html
      onChange(html)
    },
  })

  // Waarde van buitenaf (bijv. "Laden uit standaardsjabloon") overnemen.
  useEffect(() => {
    if (!editor) return
    if (waarde === eigenHtml.current) return
    eigenHtml.current = waarde
    editor.commands.setContent(waarde || '', { emitUpdate: false })
  }, [waarde, editor])

  useEffect(() => {
    editor?.setEditable(!readOnly)
  }, [readOnly, editor])

  if (!editor) {
    return <div className="min-h-[470px] rounded-lg border border-slate-200 bg-slate-50" />
  }

  const knop = (
    actief: boolean,
    titel: string,
    aan: () => void,
    Icoon: typeof Bold,
    uitgeschakeld = false,
  ) => (
    <button
      type="button"
      title={titel}
      aria-label={titel}
      aria-pressed={actief}
      disabled={readOnly || uitgeschakeld}
      // De muisklik mag de focus niet uit de editor halen: zonder dit verliest
      // ProseMirror zijn selectie en doet de opmaakknop niets. Het klassieke
      // toolbar-patroon — voorkomen is betrouwbaarder dan achteraf refocussen.
      onMouseDown={e => e.preventDefault()}
      onClick={aan}
      className={cn(
        'rounded p-1.5 text-slate-500 transition-colors',
        'hover:bg-slate-100 hover:text-slate-800',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
        actief && 'bg-slate-200 text-slate-900',
      )}
    >
      <Icoon className="h-4 w-4" />
    </button>
  )

  return (
    <div className="rounded-lg border border-slate-200 bg-white focus-within:border-everts focus-within:ring-2 focus-within:ring-everts/20">
      <div className="flex items-center gap-0.5 border-b border-slate-200 px-1.5 py-1">
        {knop(editor.isActive('bold'), 'Vet (Ctrl+B)', () => editor.chain().focus().toggleBold().run(), Bold)}
        {knop(editor.isActive('italic'), 'Cursief (Ctrl+I)', () => editor.chain().focus().toggleItalic().run(), Italic)}
        {knop(editor.isActive('underline'), 'Onderstreept (Ctrl+U)', () => editor.chain().focus().toggleUnderline().run(), UnderlineIcon)}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        {knop(editor.isActive('bulletList'), 'Opsomming', () => editor.chain().focus().toggleBulletList().run(), List)}
        {knop(editor.isActive('orderedList'), 'Genummerde lijst', () => editor.chain().focus().toggleOrderedList().run(), ListOrdered)}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        {knop(false, 'Ongedaan maken', () => editor.chain().focus().undo().run(), Undo2, !editor.can().undo())}
        {knop(false, 'Opnieuw', () => editor.chain().focus().redo().run(), Redo2, !editor.can().redo())}
      </div>

      <div className="relative">
        {/* Op `waarde` gebaseerd, niet op `editor.getHTML()`: de editor krijgt zijn
            inhoud pas in het effect ná deze render, dus met getHTML() bleef de
            hulptekst over net geladen tekst heen staan. */}
        {leeg(waarde) && placeholder && (
          <span className="pointer-events-none absolute left-6 top-5 text-sm text-slate-400">
            {placeholder}
          </span>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
