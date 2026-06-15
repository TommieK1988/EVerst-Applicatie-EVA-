'use client'
import React from 'react'
import {
  Button, Input, Textarea, Badge, Avatar, AvatarGroup, Label, Separator, LabeledSeparator,
  Checkbox, RadioGroup, RadioGroupItem, Switch,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, TooltipKbd,
  PageHeader, Alert, Spinner, Skeleton, SkeletonText, SkeletonTitle, EmptyState, Progress,
  Card, CardHeader, CardBody, CardFooter,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
  Drawer, DrawerTrigger, DrawerContent, DrawerHeader, DrawerTitle, DrawerBody, DrawerFooter,
  Popover, PopoverTrigger, PopoverContent, PopoverBody, PopoverItem,
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
  FormField, FormSection, FormRow, Combobox, DatePicker, FileUpload, FileItem,
  DataTable, TableBadge, StatCard, KanbanBoard, KanbanColumn, DossierKaart,
  WerkbonKaart, WerkbonKaartCompact, Avatar as Av,
} from '@/components/ui'
import { Search, Plus, Inbox, Euro, Clock, Users, MapPin } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'

type Demo = { naam: string; status: string; bedrag: number }
const DEMO_ROWS: Demo[] = [
  { naam: 'Renovatie Kerkstraat 12', status: 'In uitvoering', bedrag: 24500 },
  { naam: 'Onderhoud VvE Parkzicht', status: 'Offerte', bedrag: 8200 },
  { naam: 'Storingsdienst Dorpsweg', status: 'Afgerond', bedrag: 1450 },
]
const DEMO_COLS: ColumnDef<Demo, any>[] = [
  { accessorKey: 'naam', header: 'Project' },
  { accessorKey: 'status', header: 'Status', cell: (c) => <TableBadge tone="info" dot>{c.getValue()}</TableBadge> },
  { accessorKey: 'bedrag', header: 'Bedrag', cell: (c) => <span className="">€ {c.getValue<number>().toLocaleString('nl-NL')}</span> },
]

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6b757c', marginBottom: 14 }}>{title}</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>{children}</div>
    </section>
  )
}

export default function UiPreview() {
  const [checked, setChecked] = React.useState(true)
  const [sw, setSw] = React.useState(true)
  return (
    <TooltipProvider>
    <div className="eva" style={{ background: '#f8fafa', minHeight: '100dvh', padding: '48px 56px', fontFamily: 'var(--font-ui)' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.022em', marginBottom: 8 }}>EVA UI · Componenten</h1>
      <p style={{ color: '#4d575e', marginBottom: 40 }}>Visuele verificatie van de nieuwe Radix + Tailwind componenten.</p>

      <Row title="Button — variants">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="primary" loading>Laden…</Button>
        <Button variant="primary" disabled>Disabled</Button>
      </Row>

      <Row title="Button — sizes">
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
        <Button size="icon-md" variant="outline"><Plus className="h-4 w-4" /></Button>
      </Row>

      <Row title="Input">
        <div style={{ width: 240 }}><Input placeholder="Standaard input" /></div>
        <div style={{ width: 240 }}><Input prefix={<Search className="h-4 w-4" />} placeholder="Met prefix" /></div>
        <div style={{ width: 240 }}><Input disabled placeholder="Disabled" /></div>
      </Row>

      <Row title="Textarea">
        <div style={{ width: 360 }}><Textarea placeholder="Meerdere regels…" /></div>
      </Row>

      <Row title="Select">
        <div style={{ width: 240 }}>
          <Select>
            <SelectTrigger><SelectValue placeholder="Kies een optie" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="a">Optie A</SelectItem>
              <SelectItem value="b">Optie B</SelectItem>
              <SelectItem value="c">Optie C</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Row>

      <Row title="Badge — solid">
        <Badge tone="neutral" dot>Neutral</Badge>
        <Badge tone="brand" dot>Brand</Badge>
        <Badge tone="success" dot>Success</Badge>
        <Badge tone="warning" dot>Warning</Badge>
        <Badge tone="error" dot>Error</Badge>
        <Badge tone="info" dot>Info</Badge>
      </Row>
      <Row title="Badge — outline">
        <Badge variant="outline" tone="neutral">Neutral</Badge>
        <Badge variant="outline" tone="brand">Brand</Badge>
        <Badge variant="outline" tone="success">Success</Badge>
        <Badge variant="outline" tone="error">Error</Badge>
      </Row>

      <Row title="Avatar">
        <Avatar name="Maria Everts" size="sm" status="online" />
        <Avatar name="Henk Jansen" size="md" status="busy" />
        <Avatar name="Jan de Vries" size="lg" />
        <Avatar name="Erik Bos" size="xl" status="away" />
        <AvatarGroup>
          <Avatar name="Maria Everts" size="md" />
          <Avatar name="Henk Jansen" size="md" />
          <Avatar name="Jan de Vries" size="md" />
        </AvatarGroup>
      </Row>

      <Row title="Checkbox / Radio / Switch">
        <label className="flex items-center gap-2 text-[13px]"><Checkbox checked={checked} onCheckedChange={(v) => setChecked(!!v)} /> Akkoord</label>
        <RadioGroup defaultValue="1" className="flex gap-4">
          <label className="flex items-center gap-2 text-[13px]"><RadioGroupItem value="1" /> Eén</label>
          <label className="flex items-center gap-2 text-[13px]"><RadioGroupItem value="2" /> Twee</label>
        </RadioGroup>
        <label className="flex items-center gap-2.5 text-[13px]"><Switch checked={sw} onCheckedChange={setSw} /> Actief</label>
      </Row>

      <Row title="Label + Separator">
        <div style={{ width: 280 }}>
          <Label uppercase>Veldlabel</Label>
          <div style={{ marginTop: 6 }}><Input placeholder="…" /></div>
        </div>
        <div style={{ width: 200 }}><Separator /></div>
        <div style={{ width: 280 }}><LabeledSeparator>of</LabeledSeparator></div>
      </Row>

      <Row title="Tooltip">
        <Tooltip>
          <TooltipTrigger asChild><Button variant="outline">Hover mij</Button></TooltipTrigger>
          <TooltipContent>Opslaan <TooltipKbd>⌘S</TooltipKbd></TooltipContent>
        </Tooltip>
      </Row>

      <div style={{ height: 1, background: '#e3e8ea', margin: '8px 0 32px' }} />

      <Row title="PageHeader">
        <div style={{ width: '100%', background: 'white', border: '1px solid #e3e8ea', borderRadius: 10, padding: 24 }}>
          <PageHeader
            eyebrow="Hoofdproces"
            title={['Opdrachten', 'Renovatie Kerkstraat 12', 'Werkbegroting']}
            status={{ label: 'In uitvoering', tone: 'brand', dot: true }}
            actions={<><Button variant="outline" size="md">Exporteren</Button><Button size="md"><Plus className="h-4 w-4" />Nieuw</Button></>}
          />
        </div>
      </Row>

      <Row title="Alert">
        <div style={{ display: 'grid', gap: 10, width: 460 }}>
          <Alert tone="success" title="Opgeslagen">Je wijzigingen zijn bewaard.</Alert>
          <Alert tone="warning" title="Let op">Deze offerte verloopt over 3 dagen.</Alert>
          <Alert tone="error" title="Mislukt" onClose={() => {}}>De factuur kon niet worden verzonden.</Alert>
          <Alert tone="info" title="Tip">Je kunt kolommen slepen om te herordenen.</Alert>
        </div>
      </Row>

      <Row title="Card">
        <Card style={{ width: 280 }}>
          <CardHeader>Project</CardHeader>
          <CardBody>Renovatie van het kozijnwerk aan de voorgevel.</CardBody>
          <CardFooter><Button variant="ghost" size="sm">Annuleren</Button><Button size="sm">Openen</Button></CardFooter>
        </Card>
        <Card interactive style={{ width: 280 }}>
          <CardBody>Interactieve kaart (hover voor elevatie).</CardBody>
        </Card>
      </Row>

      <Row title="Spinner / Progress / Skeleton">
        <Spinner size="sm" /><Spinner size="md" /><Spinner size="lg" />
        <div style={{ width: 200 }}><Progress value={64} /></div>
        <div style={{ width: 200 }}><Progress value={38} tone="warning" /></div>
        <div style={{ width: 200, display: 'grid', gap: 8 }}>
          <SkeletonTitle style={{ width: '60%' }} />
          <SkeletonText />
          <SkeletonText style={{ width: '80%' }} />
        </div>
      </Row>

      <Row title="EmptyState">
        <div style={{ width: 420, background: 'white', border: '1px solid #e3e8ea', borderRadius: 10 }}>
          <EmptyState
            icon={<Inbox className="h-6 w-6" />}
            title="Nog geen aanvragen"
            description="Zodra er een aanvraag binnenkomt verschijnt die hier."
            actions={<Button size="md"><Plus className="h-4 w-4" />Aanvraag toevoegen</Button>}
          />
        </div>
      </Row>

      <Row title="Overlays — Modal / Drawer / Popover / AlertDialog">
        <Dialog>
          <DialogTrigger asChild><Button variant="outline">Open modal</Button></DialogTrigger>
          <DialogContent size="md">
            <DialogHeader><div><DialogTitle>Offerte versturen</DialogTitle><DialogDescription>Controleer de gegevens.</DialogDescription></div></DialogHeader>
            <DialogBody>De offerte wordt per e-mail verzonden naar de klant.</DialogBody>
            <DialogFooter><Button variant="outline">Annuleren</Button><Button>Versturen</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Drawer>
          <DrawerTrigger asChild><Button variant="outline">Open drawer</Button></DrawerTrigger>
          <DrawerContent>
            <DrawerHeader><DrawerTitle>Filters</DrawerTitle></DrawerHeader>
            <DrawerBody>Inhoud van de drawer.</DrawerBody>
            <DrawerFooter><Button variant="outline">Wissen</Button><Button>Toepassen</Button></DrawerFooter>
          </DrawerContent>
        </Drawer>

        <Popover>
          <PopoverTrigger asChild><Button variant="outline">Open popover</Button></PopoverTrigger>
          <PopoverContent>
            <PopoverBody>
              <PopoverItem active>Bewerken</PopoverItem>
              <PopoverItem>Dupliceren</PopoverItem>
              <PopoverItem>Verwijderen</PopoverItem>
            </PopoverBody>
          </PopoverContent>
        </Popover>

        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="destructive">Verwijderen</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Offerte verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>Deze actie kan niet ongedaan worden gemaakt.</AlertDialogDescription>
            <AlertDialogFooter><AlertDialogCancel>Annuleren</AlertDialogCancel><AlertDialogAction>Verwijderen</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Row>

      <Row title="Accordion">
        <div style={{ width: 460 }}>
          <Accordion type="single" collapsible defaultValue="a">
            <AccordionItem value="a">
              <AccordionTrigger badge={3}>Algemene voorwaarden</AccordionTrigger>
              <AccordionContent>De standaard leveringsvoorwaarden zijn van toepassing.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="b">
              <AccordionTrigger>Betaalschema</AccordionTrigger>
              <AccordionContent>30% aanbetaling, 70% bij oplevering.</AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </Row>

      <div style={{ height: 1, background: '#e3e8ea', margin: '8px 0 32px' }} />

      <Row title="Formulierpatronen">
        <div style={{ width: 520, background: 'white', border: '1px solid #e3e8ea', borderRadius: 10, padding: 24 }}>
          <FormSection title="Klantgegevens" description="Verplichte velden zijn gemarkeerd">
            <FormRow cols="2">
              <FormField label="Bedrijfsnaam" required><Input placeholder="Acme B.V." /></FormField>
              <FormField label="KvK-nummer" helper="8 cijfers"><Input placeholder="12345678" /></FormField>
            </FormRow>
            <FormField label="Relatie" required>
              <Combobox
                options={[
                  { value: '1', label: 'Acme B.V.', sub: 'Enschede', badge: 'Klant' },
                  { value: '2', label: 'VvE Parkzicht', sub: 'Hengelo', badge: 'VvE' },
                ]}
                onCreate={() => {}}
              />
            </FormField>
            <FormRow cols="2">
              <FormField label="Startdatum"><DatePicker /></FormField>
              <FormField label="E-mail" error="Ongeldig e-mailadres"><Input aria-invalid placeholder="naam@bedrijf.nl" /></FormField>
            </FormRow>
            <FormField label="Bijlagen">
              <FileUpload sub="PDF, JPG of PNG tot 10MB" />
              <div style={{ marginTop: 10 }}><FileItem name="offerte-2026.pdf" size="248 KB" onRemove={() => {}} /></div>
            </FormField>
          </FormSection>
        </div>
      </Row>

      <Row title="StatCard">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, width: 720 }}>
          <StatCard tone="brand" icon={<Euro className="h-5 w-5" />} label="Omzet YTD" value="€ 1,2" unit="mln" trend={{ direction: 'up', value: '+12%', compare: 'vs vorig jaar' }} />
          <StatCard tone="info" icon={<Clock className="h-5 w-5" />} label="Open aanvragen" value="34" trend={{ direction: 'down', value: '-3', compare: 'deze week' }} />
          <StatCard tone="success" icon={<Users className="h-5 w-5" />} label="Actieve monteurs" value="18" trend={{ direction: 'flat', value: 'stabiel' }} />
        </div>
      </Row>

      <Row title="DataTable">
        <div style={{ width: 720 }}>
          <DataTable columns={DEMO_COLS} data={DEMO_ROWS} searchPlaceholder="Zoek project…" />
        </div>
      </Row>

      <Row title="Kanban + DossierKaart">
        <div style={{ width: 720 }}>
          <KanbanBoard>
            <KanbanColumn title="Nieuw" status="new" count={2} onAdd={() => {}}>
              <DossierKaart draggable dossierId="AANV-0231" title="Dakkapel vervangen" client="Fam. Jansen" amount="€ 4.200" meta={<><MapPin className="h-3 w-3" />Enschede</>} priorityHigh />
              <DossierKaart draggable dossierId="AANV-0232" title="Schilderwerk gevel" client="VvE Parkzicht" amount="€ 8.900" />
            </KanbanColumn>
            <KanbanColumn title="In behandeling" status="prog" count={1}>
              <DossierKaart draggable dossierId="OFF-0118" title="Kozijnrenovatie" client="Acme B.V." amount="€ 24.500" />
            </KanbanColumn>
            <KanbanColumn title="Wacht op klant" status="wait" count={0} />
            <KanbanColumn title="Gewonnen" status="done" count={0} />
          </KanbanBoard>
        </div>
      </Row>

      <Row title="WerkbonKaart — statussen">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 240px)', gap: 14 }}>
          <WerkbonKaart
            status="bezig" werkbonId="WB-2041" dossier="OPDR-0118" title="Kozijn herstellen voorgevel"
            category={<>Houtrotherstel</>}
            meta={<><span className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-neutral-400" />Kerkstraat 12, Enschede</span></>}
            progress={{ value: 65 }}
            footer={<><span className="flex items-center gap-2"><Av name="Henk de Boer" size="sm" /><span className="text-[11px] text-neutral-500">Henk</span></span></>}
          />
          <WerkbonKaart status="onderweg" werkbonId="WB-2042" dossier="OPDR-0120" title="Storingsmelding lekkage" category={<>Storingsdienst</>} tasks={{ total: 4, done: 1 }} />
          <WerkbonKaart status="probleem" werkbonId="WB-2043" title="Schilderwerk kozijnen" priorityHigh progress={{ value: 20 }} />
        </div>
      </Row>

      <Row title="WerkbonKaart — compact (planning)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 260 }}>
          <WerkbonKaartCompact status="afgerond" time="08:00–10:30" werkbonId="WB-2040" title="Inspectie dak" location="Dorpsweg 4" />
          <WerkbonKaartCompact status="bezig" time="11:00–14:00" werkbonId="WB-2041" title="Kozijn herstellen voorgevel" location="Kerkstraat 12" />
        </div>
      </Row>
    </div>
    </TooltipProvider>
  )
}
