'use client'
import { useState } from 'react'
import Link from 'next/link'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  pointerWithin,
  rectIntersection,
  useDroppable,
} from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'

interface Contact {
  id: string
  name: string
  company: string | null
  emailStatus: string
  touchNumber: number
  salesPhase: string
}

interface Phase {
  value: string
  label: string
  color: string
}

const PHASES: Phase[] = [
  { value: 'LEAD', label: 'リード', color: 'border-gray-300' },
  { value: 'APPOINTMENT', label: 'アポ調整', color: 'border-blue-300' },
  { value: 'MEETING_DONE', label: '打ち合わせ完了', color: 'border-purple-300' },
  { value: 'PROPOSING', label: '提案中', color: 'border-yellow-300' },
  { value: 'CONTRACTED', label: '受注', color: 'border-green-300' },
  { value: 'NURTURING', label: '育成中', color: 'border-orange-300' },
]

const STATUS_DOT: Record<string, string> = {
  UNSENT: 'bg-gray-300', DRAFTED: 'bg-yellow-400', APPROVED: 'bg-blue-400', SENT: 'bg-green-400',
}

function ContactCard({ contact, isDragging }: { contact: Contact; isDragging?: boolean }) {
  return (
    <div className={`bg-white rounded-lg p-3 shadow-sm border border-gray-100 ${isDragging ? 'shadow-lg ring-2 ring-blue-400 opacity-90' : 'hover:shadow-md'} transition-shadow`}>
      <div className="flex items-start justify-between gap-1">
        <p className="text-sm font-medium text-gray-900 truncate">{contact.name}</p>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${STATUS_DOT[contact.emailStatus] || 'bg-gray-300'}`} title={contact.emailStatus} />
      </div>
      {contact.company && <p className="text-xs text-gray-500 truncate">{contact.company}</p>}
      {contact.touchNumber > 0 && <p className="text-xs text-blue-500 mt-1">📨 {contact.touchNumber}回</p>}
    </div>
  )
}

function DraggableCard({ contact }: { contact: Contact }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: contact.id,
    data: { contact },
  })

  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={`${isDragging ? 'opacity-30' : ''}`}>
      <Link href={`/contacts/${contact.id}`} onClick={e => { if (isDragging) e.preventDefault() }}>
        <ContactCard contact={contact} />
      </Link>
    </div>
  )
}

function DroppableColumn({ phase, contacts }: { phase: Phase; contacts: Contact[] }) {
  const { isOver, setNodeRef } = useDroppable({ id: phase.value })

  return (
    <div
      ref={setNodeRef}
      className={`w-full md:w-56 md:flex-shrink-0 rounded-xl border-t-4 ${phase.color} p-3 transition-colors ${
        isOver ? 'bg-blue-50 ring-2 ring-blue-300' : 'bg-gray-50'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">{phase.label}</h2>
        <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{contacts.length}</span>
      </div>
      <div className="space-y-2 min-h-[40px]">
        {contacts.map(c => (
          <DraggableCard key={c.id} contact={c} />
        ))}
        {contacts.length === 0 && !isOver && <p className="text-xs text-gray-400 text-center py-3">なし</p>}
      </div>
    </div>
  )
}

function LostDropZone() {
  const { isOver, setNodeRef } = useDroppable({ id: 'LOST' })

  return (
    <div
      ref={setNodeRef}
      className={`mt-4 rounded-xl border-2 border-dashed py-4 text-center transition-colors ${
        isOver
          ? 'border-red-400 bg-red-50 text-red-600'
          : 'border-red-200 bg-red-50/50 text-red-400'
      }`}
    >
      <span className="text-lg">✕</span>
      <p className="text-sm font-medium mt-1">ここにドロップで失注</p>
    </div>
  )
}

export default function PipelineBoard({ initialContacts }: { initialContacts: Contact[] }) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts.filter(c => c.salesPhase !== 'LOST'))
  const [activeContact, setActiveContact] = useState<Contact | null>(null)

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  })
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 5 },
  })
  const sensors = useSensors(pointerSensor, touchSensor)

  const handleDragStart = (event: DragStartEvent) => {
    const contact = event.active.data.current?.contact as Contact
    if (contact) setActiveContact(contact)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveContact(null)
    const { active, over } = event
    if (!over) return

    const contactId = active.id as string
    const newPhase = over.id as string

    const contact = contacts.find(c => c.id === contactId)
    if (!contact || contact.salesPhase === newPhase) return

    // Optimistic update
    if (newPhase === 'LOST') {
      // Remove from board
      setContacts(prev => prev.filter(c => c.id !== contactId))
    } else {
      setContacts(prev => prev.map(c => c.id === contactId ? { ...c, salesPhase: newPhase } : c))
    }

    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salesPhase: newPhase }),
      })
      if (!res.ok) throw new Error()
    } catch {
      // Rollback on error
      if (newPhase === 'LOST') {
        setContacts(prev => [...prev, contact])
      } else {
        setContacts(prev => prev.map(c => c.id === contactId ? { ...c, salesPhase: contact.salesPhase } : c))
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="block md:overflow-x-auto">
        <div className="flex flex-col gap-4 md:flex-row md:min-w-max pb-4">
          {PHASES.map(phase => (
            <DroppableColumn
              key={phase.value}
              phase={phase}
              contacts={contacts.filter(c => c.salesPhase === phase.value)}
            />
          ))}
        </div>
      </div>
      {activeContact && <LostDropZone />}
      <DragOverlay>
        {activeContact ? (
          <div className="w-56">
            <ContactCard contact={activeContact} isDragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
