import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useApi } from '../hooks/useApi'
import { api } from '../lib/api'
import { Spinner } from '../components/ui/Spinner'
import { Badge } from '../components/ui/Badge'
import {
  Users, Search, Tag, X, Plus, UserPlus,
  Download, Upload, Pencil, Trash2, Check, Square, CheckSquare, ChevronDown,
  Archive, MessageSquare, Phone, Mail, Calendar, Building2, MapPin, ChevronRight,
} from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────

const STAGE_STORAGE = 'aria_funnel_stages'
function getStage(id) {
  try {
    const m = JSON.parse(localStorage.getItem(STAGE_STORAGE) || '{}')
    return m[id] || 'prospecto'
  } catch { return 'prospecto' }
}
const STAGE_LABELS  = { prospecto: 'Prospecto', calificado: 'Calificado', propuesta: 'Propuesta', cerrado: 'Cerrado' }
const STAGE_VARIANT = { prospecto: 'default',   calificado: 'info',        propuesta: 'warning',   cerrado: 'success' }

const PRESET_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308',
  '#22C55E', '#14B8A6', '#3B82F6', '#6366F1',
  '#A855F7', '#EC4899',
]

// ── TagsModal ─────────────────────────────────────────────────────────────────

function TagsModal({ projectId, onClose, onChanged }) {
  const [tags, setTags]           = useState([])
  const [loadingTags, setLoading] = useState(true)
  const [selected, setSelected]   = useState(new Set())

  // create form
  const [newName, setNewName]   = useState('')
  const [newColor, setNewColor] = useState('#3B82F6')
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState(null)

  // edit form
  const [editId, setEditId]     = useState(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [saving, setSaving]     = useState(false)

  const colorPickerRef = useRef(null)
  const editColorRef   = useRef(null)

  // Load ─────────────────────────────────────────────────────────────────────
  const loadTags = async () => {
    setLoading(true)
    try {
      const data = await api.getLabels(projectId)
      const list = Array.isArray(data) ? data : (data?.data || data?.labels || [])
      setTags(list)
    } catch {}
    finally { setLoading(false) }
  }
  useEffect(() => { loadTags() }, [projectId]) // eslint-disable-line

  // Create ───────────────────────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault()
    if (!newName.trim()) { setCreateErr('El nombre es requerido'); return }
    setCreating(true); setCreateErr(null)
    try {
      await api.createLabel(projectId, { title: newName.trim(), color: newColor })
      setNewName(''); setNewColor('#3B82F6')
      await loadTags()
      onChanged?.()
    } catch (err) {
      setCreateErr(err.message || 'Error al crear el tag')
    } finally { setCreating(false) }
  }

  // Edit ─────────────────────────────────────────────────────────────────────
  const startEdit = (tag) => {
    setEditId(tag._id || tag.id)
    setEditName(tag.title || tag.name || '')
    setEditColor(tag.color || '#3B82F6')
  }
  const cancelEdit = () => setEditId(null)

  const handleSave = async (tag) => {
    const id = tag._id || tag.id
    setSaving(true)
    try {
      await api.updateLabel(projectId, id, { title: editName.trim(), color: editColor })
      setEditId(null)
      await loadTags()
      onChanged?.()
    } catch (err) {
      alert(err.message || 'Error al guardar')
    } finally { setSaving(false) }
  }

  // Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = async (tag) => {
    const id = tag._id || tag.id
    if (!window.confirm(`¿Eliminar el tag "${tag.title || tag.name}"?`)) return
    try {
      await api.deleteLabel(projectId, id)
      setSelected(s => { const n = new Set(s); n.delete(id); return n })
      await loadTags()
      onChanged?.()
    } catch (err) {
      alert(err.message || 'Error al eliminar')
    }
  }

  // Bulk select ──────────────────────────────────────────────────────────────
  const toggleSelect = (id) => setSelected(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1a1d27] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-white/8 shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-aria-500/15 flex items-center justify-center mt-0.5 shrink-0">
              <Tag className="w-4.5 h-4.5 text-aria-400" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Gestión de Tags</h2>
              <p className="text-xs text-white/40 mt-0.5">Crea, edita y elimina tags para organizar tus contactos</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors mt-0.5">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

          {/* Create section */}
          <div className="border border-white/8 rounded-xl p-4 space-y-4">
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Crear Nuevo Tag</p>

            <form onSubmit={handleCreate} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">
                  Nombre del Tag <span className="text-red-400">*</span>
                </label>
                <input
                  value={newName}
                  onChange={e => { setNewName(e.target.value); setCreateErr(null) }}
                  placeholder="Ej: Cliente VIP"
                  className="w-full bg-surface-50 text-white text-sm px-3.5 py-2.5 rounded-xl border border-white/10 outline-none focus:border-aria-500 transition-colors placeholder:text-white/20"
                />
              </div>

              {/* Color palette */}
              <div>
                <label className="block text-xs font-medium text-white/50 mb-2">Color</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      className="w-7 h-7 rounded-lg transition-all shrink-0 relative"
                      style={{ backgroundColor: c, boxShadow: newColor === c ? `0 0 0 2px #0f1017, 0 0 0 4px ${c}` : 'none' }}
                    />
                  ))}
                  {/* Custom color picker */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => colorPickerRef.current?.click()}
                      className="h-7 w-14 rounded-lg border border-white/20 flex items-center justify-center overflow-hidden shrink-0 transition-all"
                      style={{
                        background: 'linear-gradient(135deg, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #a855f7)',
                        boxShadow: !PRESET_COLORS.includes(newColor) ? `0 0 0 2px #0f1017, 0 0 0 4px ${newColor}` : 'none',
                      }}
                    />
                    <input
                      ref={colorPickerRef}
                      type="color"
                      value={newColor}
                      onChange={e => setNewColor(e.target.value)}
                      className="absolute opacity-0 w-0 h-0 pointer-events-none"
                    />
                  </div>
                  {/* Preview */}
                  <div
                    className="h-7 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1 text-white shrink-0"
                    style={{ backgroundColor: newColor + '33', border: `1px solid ${newColor}66`, color: newColor }}
                  >
                    <Tag className="w-3 h-3" />
                    {newName || 'Preview'}
                  </div>
                </div>
              </div>

              {createErr && (
                <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{createErr}</p>
              )}

              <button
                type="submit"
                disabled={creating}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-aria-500 hover:bg-aria-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {creating ? <Spinner className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {creating ? 'Creando...' : 'Crear Tag'}
              </button>
            </form>
          </div>

          {/* Existing tags */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Tags Existentes</p>
              <span className="text-xs bg-white/10 text-white/50 px-2 py-0.5 rounded-full font-medium">{tags.length}</span>
            </div>

            {loadingTags ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : tags.length === 0 ? (
              <div className="text-center py-8 text-white/25 text-sm">Aún no hay tags creados</div>
            ) : (
              <div className="space-y-1.5">
                {tags.map(tag => {
                  const id    = tag._id || tag.id
                  const name  = tag.title || tag.name || ''
                  const color = tag.color || '#6B7280'
                  const isEditing = editId === id

                  return (
                    <div
                      key={id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/6 hover:border-white/10 bg-white/2 transition-colors"
                    >
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleSelect(id)}
                        className="text-white/30 hover:text-white/70 transition-colors shrink-0"
                      >
                        {selected.has(id)
                          ? <CheckSquare className="w-4 h-4 text-aria-400" />
                          : <Square className="w-4 h-4" />}
                      </button>

                      {isEditing ? (
                        /* Edit mode */
                        <div className="flex-1 flex items-center gap-2 flex-wrap">
                          <input
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            className="flex-1 min-w-0 bg-surface-50 text-white text-sm px-2.5 py-1 rounded-lg border border-white/15 outline-none focus:border-aria-500 transition-colors"
                          />
                          <div className="flex items-center gap-1.5">
                            {PRESET_COLORS.map(c => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setEditColor(c)}
                                className="w-5 h-5 rounded-md shrink-0 transition-all"
                                style={{ backgroundColor: c, boxShadow: editColor === c ? `0 0 0 2px #0f1017, 0 0 0 3px ${c}` : 'none' }}
                              />
                            ))}
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => editColorRef.current?.click()}
                                className="w-5 h-5 rounded-md border border-white/20 shrink-0"
                                style={{ background: 'linear-gradient(135deg, #ef4444, #3b82f6, #a855f7)' }}
                              />
                              <input
                                ref={editColorRef}
                                type="color"
                                value={editColor}
                                onChange={e => setEditColor(e.target.value)}
                                className="absolute opacity-0 w-0 h-0 pointer-events-none"
                              />
                            </div>
                          </div>
                          <div className="flex gap-1.5 ml-auto">
                            <button
                              onClick={() => handleSave(tag)}
                              disabled={saving}
                              className="p-1.5 rounded-lg bg-aria-500/20 hover:bg-aria-500/40 text-aria-400 transition-colors"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1.5 rounded-lg hover:bg-white/8 text-white/30 hover:text-white transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* View mode */
                        <>
                          <div className="flex-1 flex items-center gap-2 min-w-0">
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <span
                              className="text-sm font-medium truncate px-2 py-0.5 rounded-md"
                              style={{ color, backgroundColor: color + '20' }}
                            >
                              {name}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => startEdit(tag)}
                              className="p-1.5 rounded-lg hover:bg-white/8 text-white/30 hover:text-white/80 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(tag)}
                              className="p-1.5 rounded-lg hover:bg-red-500/15 text-white/30 hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── ContactModal ──────────────────────────────────────────────────────────────

const MANAGED_ATTRS = ['phone', 'notes', 'company', 'address', 'labels']

function ContactModal({ projectId, labels = [], contact = null, onClose, onCreated }) {
  const isEdit  = !!contact
  const rawName = contact?.fullname || contact?.lead_name || contact?.name || ''
  const spaceAt = rawName.indexOf(' ')

  const [form, setForm] = useState({
    firstName: spaceAt > -1 ? rawName.slice(0, spaceAt) : rawName,
    lastName:  spaceAt > -1 ? rawName.slice(spaceAt + 1) : '',
    email:     contact?.email || '',
    phone:     contact?.phone || contact?.attributes?.phone || '',
    company:   contact?.company || '',
    address:   contact?.streetAddress || '',
    note:      contact?.note || '',
  })
  const [selectedTags, setSelectedTags] = useState(
    contact?.tags || contact?.attributes?.labels || []
  )
  const [tagsOpen, setTagsOpen]           = useState(false)
  const [showWidgetAttrs, setShowWidget]  = useState(false)
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState(null)

  const handleChange = (e) => { setForm(f => ({ ...f, [e.target.name]: e.target.value })); setError(null) }
  const toggleTag    = (title) =>
    setSelectedTags(ts => ts.includes(title) ? ts.filter(t => t !== title) : [...ts, title])

  // Widget-injected attributes — all attributes are widget data (read-only)
  const widgetAttrs = Object.entries(contact?.attributes || {})

  const handleSubmit = async (e) => {
    e.preventDefault()
    const fullName = [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(' ')
    if (!fullName) { setError('El nombre es requerido'); return }
    setSaving(true)
    try {
      const fullname = fullName
      const email         = form.email.trim()   || undefined
      const phone         = form.phone.trim()   || undefined
      const company       = form.company.trim() || undefined
      const streetAddress = form.address.trim() || undefined
      const note          = form.note.trim()    || undefined
      const tags          = selectedTags

      if (isEdit) {
        // PUT acepta todos los campos top-level directamente
        const payload = {
          fullname,
          attributes: contact?.attributes || {},  // preservar datos del widget
          tags,
        }
        if (email)         payload.email         = email
        if (phone)         payload.phone         = phone
        if (company)       payload.company       = company
        if (streetAddress) payload.streetAddress = streetAddress
        if (note)          payload.note          = note
        await api.updateContact(projectId, contact._id || contact.id, payload)
      } else {
        // POST+PUT encadenado (ver api.js)
        await api.createContact(projectId, { fullname, email, phone, company, note, streetAddress, tags })
      }
      onCreated(); onClose()
    } catch (err) {
      setError(err.message || `Error al ${isEdit ? 'actualizar' : 'crear'} el contacto`)
    } finally { setSaving(false) }
  }

  const inputCls = 'w-full bg-surface-50 text-white text-sm px-3.5 py-2.5 rounded-xl border border-white/10 outline-none focus:border-aria-500 transition-colors placeholder:text-white/20'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1d27] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-white/8">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-aria-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <UserPlus className="w-4 h-4 text-aria-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">{isEdit ? 'Editar Contacto' : 'Nuevo Contacto'}</h2>
              <p className="text-xs text-white/35 mt-0.5">{isEdit ? 'Modificá los datos del contacto' : 'Agrega un nuevo contacto a tu base de datos'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors mt-0.5"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* Información Personal */}
          <div>
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Información Personal</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Nombre <span className="text-red-400">*</span></label>
                <input name="firstName" value={form.firstName} onChange={handleChange} placeholder="Ej: María" autoFocus className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Apellido</label>
                <input name="lastName" value={form.lastName} onChange={handleChange} placeholder="Ej: González" className={inputCls} />
              </div>
            </div>
          </div>

          {/* Datos de contacto */}
          <div>
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Datos de Contacto</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
                  <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="email@ejemplo.com"
                    className={inputCls + ' pl-9'} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Teléfono</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
                  <input name="phone" type="tel" value={form.phone} onChange={handleChange} placeholder="549612345678"
                    className={inputCls + ' pl-9'} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Empresa</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
                  <input name="company" value={form.company} onChange={handleChange} placeholder="Nombre de la empresa"
                    className={inputCls + ' pl-9'} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Dirección</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
                  <input name="address" value={form.address} onChange={handleChange} placeholder="Calle, ciudad, país"
                    className={inputCls + ' pl-9'} />
                </div>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div>
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Tags</p>
            <div className="relative">
              <button type="button" onClick={() => setTagsOpen(o => !o)}
                className="w-full bg-surface-50 text-sm px-3.5 py-2.5 rounded-xl border border-white/10 outline-none focus:border-aria-500 transition-colors text-left flex items-center justify-between gap-2">
                {selectedTags.length ? (
                  <div className="flex flex-wrap gap-1">
                    {selectedTags.map(t => {
                      const lbl   = labels.find(l => (l.title || l.name) === t)
                      const color = lbl?.color || '#6B7280'
                      return (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                          style={{ backgroundColor: color + '25', color, border: `1px solid ${color}40` }}>{t}</span>
                      )
                    })}
                  </div>
                ) : (
                  <span className="text-white/20">Seleccionar tags...</span>
                )}
                <ChevronDown className={`w-4 h-4 text-white/30 shrink-0 transition-transform ${tagsOpen ? 'rotate-180' : ''}`} />
              </button>
              {tagsOpen && (
                <div className="absolute z-10 mt-1 w-full bg-[#1a1d27] border border-white/10 rounded-xl shadow-xl overflow-hidden">
                  {labels.length === 0 ? (
                    <p className="px-3.5 py-3 text-xs text-white/40">No hay tags disponibles</p>
                  ) : labels.map(l => {
                    const title   = l.title || l.name || ''
                    const color   = l.color || '#6B7280'
                    const checked = selectedTags.includes(title)
                    return (
                      <button key={title} type="button" onClick={() => toggleTag(title)}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-white/5 transition-colors">
                        <div className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${checked ? 'bg-aria-500 border-aria-500' : 'border-white/20'}`}>
                          {checked && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                          style={{ backgroundColor: color + '25', color, border: `1px solid ${color}40` }}>{title}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">Notas</label>
            <textarea name="note" value={form.note} onChange={handleChange} rows={3}
              placeholder="Agrega notas adicionales sobre este contacto..."
              className="w-full bg-surface-50 text-white text-sm px-3.5 py-2.5 rounded-xl border border-white/10 outline-none focus:border-aria-500 transition-colors placeholder:text-white/20 resize-none" />
          </div>

          {/* Atributos del widget (read-only, collapsible) */}
          {isEdit && widgetAttrs.length > 0 && (
            <div className="border border-white/8 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowWidget(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/3 transition-colors"
              >
                <span className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">
                  Atributos del widget ({widgetAttrs.length})
                </span>
                <ChevronRight className={`w-4 h-4 text-white/25 transition-transform ${showWidgetAttrs ? 'rotate-90' : ''}`} />
              </button>
              {showWidgetAttrs && (
                <div className="px-4 pb-4 space-y-2 border-t border-white/6 pt-3">
                  {widgetAttrs.map(([k, v]) => {
                    const display = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')
                    return (
                      <div key={k} className="flex gap-2 text-xs">
                        <span className="text-white/35 shrink-0 min-w-[100px]">{k}</span>
                        <span className="text-white/55 break-all font-mono">{display}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-sm text-white/60 hover:text-white hover:border-white/20 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-aria-500 hover:bg-aria-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
              {saving ? <Spinner className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear Contacto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── TagsPopover ───────────────────────────────────────────────────────────────

function TagsPopover({ contact, labels, labelColorMap, projectId, pos, onClose, onUpdated }) {
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState([...(contact.tags || contact.attributes?.labels || [])])
  const [saving, setSaving]     = useState(false)

  const persist = async (next) => {
    setSaving(true)
    try {
      await api.updateContact(projectId, contact._id || contact.id, { tags: next })
      onUpdated()
    } catch { /* silent */ } finally { setSaving(false) }
  }

  const toggle = (title) => {
    const next = selected.includes(title) ? selected.filter(t => t !== title) : [...selected, title]
    setSelected(next)
    persist(next)
  }

  const filteredLabels = labels.filter(l => {
    const t = l.title || l.name || ''
    return !search || t.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed z-50 bg-[#1a1d27] border border-white/10 rounded-xl shadow-2xl w-64 p-3"
        style={{ top: pos.top, left: pos.left }}>

        {/* Badges seleccionados */}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2.5 pb-2.5 border-b border-white/8">
            {selected.map(t => {
              const color = labelColorMap[t] || '#6B7280'
              return (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-md flex items-center gap-0.5 font-medium"
                  style={{ backgroundColor: color + '25', color, border: `1px solid ${color}40` }}>
                  {t}
                  <button onClick={() => toggle(t)} className="ml-0.5 opacity-60 hover:opacity-100"><X className="w-2.5 h-2.5" /></button>
                </span>
              )
            })}
          </div>
        )}

        {/* Buscador */}
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)} autoFocus
            placeholder="Buscar o crear tag..."
            className="w-full bg-surface-50 text-white text-xs pl-7 pr-3 py-1.5 rounded-lg border border-white/10 outline-none focus:border-aria-500 placeholder:text-white/20" />
        </div>

        {/* Lista */}
        <div className="max-h-48 overflow-y-auto">
          {filteredLabels.length === 0
            ? <p className="text-xs text-white/30 px-2 py-1.5">Sin resultados</p>
            : filteredLabels.map(l => {
              const title     = l.title || l.name || ''
              const color     = l.color || '#6B7280'
              const isChecked = selected.includes(title)
              return (
                <button key={title} type="button" onClick={() => toggle(title)} disabled={saving}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
                  <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border shrink-0 transition-colors ${isChecked ? 'bg-aria-500 border-aria-500' : 'border-white/20'}`}>
                    {isChecked && <Check className="w-2 h-2 text-white" />}
                  </div>
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-xs text-white/70">{title}</span>
                </button>
              )
            })
          }
        </div>
      </div>
    </>
  )
}

// ── ConvsPopover ──────────────────────────────────────────────────────────────

function ConvsPopover({ contact, projectId, pos, onClose }) {
  const contactId = contact._id || contact.id
  const { data, loading } = useApi(
    () => api.getContactRequests(projectId, contactId),
    [contactId]
  )
  const convs = Array.isArray(data) ? data : (data?.requests || data?.data || [])

  const timeAgo = (dateStr) => {
    if (!dateStr) return '—'
    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
    if (days === 0) return 'Hoy'
    if (days === 1) return 'Ayer'
    return `Hace ${days} días`
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed z-50 bg-[#1a1d27] border border-white/10 rounded-xl shadow-2xl w-72 overflow-hidden"
        style={{ top: pos.top, left: Math.min(pos.left, window.innerWidth - 300) }}>
        <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
          <span className="text-sm font-semibold text-white">Conversaciones</span>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
        </div>
        {loading ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : convs.length === 0 ? (
          <p className="px-4 py-5 text-xs text-white/40 text-center">Sin conversaciones registradas</p>
        ) : (
          <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
            {convs.map((conv, i) => {
              const phone = conv.lead?.attributes?.phone || conv.lead?.phone
                || contact.attributes?.phone || contact.phone || '—'
              return (
                <div key={conv._id || i} className="flex items-center gap-3 px-4 py-2.5">
                  <Phone className="w-3.5 h-3.5 text-white/30 shrink-0" />
                  <span className="text-xs text-white/60 flex-1 truncate">{phone}</span>
                  <span className="text-xs text-white/30 shrink-0">{timeAgo(conv.createdAt)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Contacts() {
  const { project }     = useAuth()
  const projectId       = project?._id || project?.id
  const [search, setSearch]         = useState('')
  const [activeLabel, setActiveLabel] = useState(null)
  const [showTags, setShowTags]         = useState(false)
  const [showNew, setShowNew]           = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [editContact, setEditContact]   = useState(null)
  const [tagsPos, setTagsPos]           = useState(null) // { contact, top, left }
  const [convsPos, setConvsPos]         = useState(null) // { contact, top, left }
  const [refreshKey, setRefreshKey]     = useState(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { data, loading } = useApi(
    () => api.getContacts(projectId, { limit: 200 }),
    [projectId, refreshKey],
  )

  const { data: labelsData, refetch: refetchLabels } = useApi(
    () => api.getLabels(projectId),
    [projectId],
  )

  const contacts = (Array.isArray(data) ? data : (data?.leads || data?.contacts || []))
    .filter(c => !c.attributes?.aria_test_contact)
    .map(c => ({ ...c, fullname: c.fullname || c.name, _id: c._id || c.id }))
  const labels   = Array.isArray(labelsData) ? labelsData : (labelsData?.data || labelsData?.labels || [])

  // color map: title → color
  const labelColorMap = Object.fromEntries(
    labels.map(l => [l.title || l.name || '', l.color || '#6B7280'])
  )

  const filtered = contacts.filter(c => {
    const q = search.toLowerCase()
    const matchQ = !q ||
      c.fullname?.toLowerCase().includes(q) ||
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.attributes?.phone?.includes(q) ||
      c.phone?.includes(q)
    if (!matchQ) return false
    if (!activeLabel) return true
    const cLabels = c.tags || c.attributes?.labels || []
    return cLabels.includes(activeLabel)
  })

  const allLabelTitles = [...new Set(labels.map(l => l.title || l.name || l).filter(Boolean))]

  const handleDelete = async (c) => {
    if (!window.confirm(`¿Eliminar el contacto "${c.fullname || c.name}"? Esta acción no se puede deshacer.`)) return
    try {
      await api.deleteContact(projectId, c._id || c.id)
      setRefreshKey(k => k + 1)
    } catch (err) {
      alert(err.message || 'Error al eliminar el contacto')
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Contactos</h1>
          <p className="text-sm text-white/40 mt-0.5">Gestiona tu base de datos de contactos y leads</p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* Tags */}
          <button
            onClick={() => setShowTags(true)}
            className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border border-white/10 hover:border-white/20 hover:bg-white/4 text-white/50 hover:text-white transition-colors"
          >
            <Tag className="w-4 h-4" />
            <span className="text-[10px] leading-none">Tags</span>
          </button>

          {/* Importar */}
          <button
            onClick={() => alert('Importar — próximamente')}
            className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border border-white/10 hover:border-white/20 hover:bg-white/4 text-white/50 hover:text-white transition-colors"
          >
            <Download className="w-4 h-4" />
            <span className="text-[10px] leading-none">Importar</span>
          </button>

          {/* Exportar */}
          <button
            onClick={() => alert('Exportar — próximamente')}
            className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border border-white/10 hover:border-white/20 hover:bg-white/4 text-white/50 hover:text-white transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span className="text-[10px] leading-none">Exportar</span>
          </button>

          {/* Nuevo */}
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-aria-500 hover:bg-aria-600 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nuevo
          </button>
        </div>
      </div>

      {/* ── Label filter chips ── */}
      {allLabelTitles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {allLabelTitles.map(title => {
            const color = labelColorMap[title] || '#6B7280'
            const isActive = activeLabel === title
            return (
              <button
                key={title}
                onClick={() => setActiveLabel(isActive ? null : title)}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors"
                style={isActive
                  ? { backgroundColor: color + '33', borderColor: color + '88', color }
                  : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }
                }
              >
                <Tag className="w-3 h-3" />{title}
              </button>
            )
          })}
          {activeLabel && (
            <button onClick={() => setActiveLabel(null)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-full text-white/30 hover:text-white transition-colors">
              <X className="w-3 h-3" /> Limpiar
            </button>
          )}
        </div>
      )}

      {/* ── Search ── */}
      <div className="relative mb-6">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <input
          type="text"
          placeholder="Buscar por nombre, email o teléfono..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-surface-50 text-white text-sm pl-10 pr-4 py-2.5 rounded-xl border border-white/10 outline-none focus:border-aria-500 transition-colors placeholder:text-white/20"
        />
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="flex items-center justify-center h-40"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-white/30">
          <Users className="w-8 h-8 mb-3 opacity-30" />
          <p className="text-sm">{search || activeLabel ? 'Sin resultados para tu búsqueda' : 'Sin contactos aún'}</p>
          {!search && !activeLabel && (
            <button onClick={() => setShowNew(true)}
              className="mt-4 flex items-center gap-1.5 text-xs text-aria-400 hover:text-aria-300 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Crear el primer contacto
            </button>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden p-0">

          {/* ── Cabecera de sección ── */}
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-white/40" />
              <span className="text-sm font-semibold text-white/80">Lista de Contactos</span>
              <span className="text-xs text-white/25 ml-1">
                {filtered.length} {filtered.length === 1 ? 'contacto' : 'contactos'}
              </span>
            </div>
            <button
              onClick={() => setShowArchived(a => !a)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                showArchived
                  ? 'border-aria-500/50 text-aria-400 bg-aria-500/10'
                  : 'border-white/10 text-white/40 hover:text-white hover:border-white/20'
              }`}
            >
              <Archive className="w-3 h-3" />
              Ver archivados
            </button>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-xs font-medium text-white/30 uppercase tracking-wider">Contacto</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-white/30 uppercase tracking-wider">Email</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-white/30 uppercase tracking-wider">Teléfono</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-white/30 uppercase tracking-wider">Etiquetas</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-white/30 uppercase tracking-wider">Fecha Creación</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-white/30 uppercase tracking-wider">Conversaciones</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-white/30 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => {
                const id        = c._id || c.id
                const name      = c.fullname || c.name || '—'
                const email     = c.email || '—'
                const phone     = c.phone || c.attributes?.phone || '—'
                const cLabels   = c.tags || c.attributes?.labels || []
                const created   = c.createdAt || c.lead_date
                const convCount = c.requestsCount ?? c.conversations_count ?? '—'
                return (
                  <tr key={id || i} className="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors">

                    {/* Contacto */}
                    <td className="px-4 py-3">
                      <button onClick={() => setEditContact(c)}
                        className="flex items-center gap-2.5 group text-left">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-aria-400 to-aria-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                          {name[0]?.toUpperCase() || '?'}
                        </div>
                        <span className="font-medium text-white group-hover:text-aria-300 transition-colors">{name}</span>
                      </button>
                    </td>

                    {/* Email */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-white/50 text-xs">
                        <Mail className="w-3.5 h-3.5 shrink-0 text-white/25" />
                        {email}
                      </div>
                    </td>

                    {/* Teléfono */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-white/50 text-xs">
                        <Phone className="w-3.5 h-3.5 shrink-0 text-white/25" />
                        {phone}
                      </div>
                    </td>

                    {/* Etiquetas */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {cLabels.map((l, j) => {
                          const lName  = typeof l === 'string' ? l : (l.title || l.name || '')
                          const lColor = labelColorMap[lName] || '#6B7280'
                          return (
                            <button key={j} onClick={e => {
                              const r = e.currentTarget.getBoundingClientRect()
                              setTagsPos({ contact: c, top: r.bottom + 4, left: r.left })
                            }}
                              className="text-[10px] px-1.5 py-0.5 rounded-md flex items-center gap-0.5 font-medium hover:opacity-80 transition-opacity"
                              style={{ backgroundColor: lColor + '25', color: lColor, border: `1px solid ${lColor}40` }}>
                              <Tag className="w-2.5 h-2.5" />{lName}
                            </button>
                          )
                        })}
                        <button onClick={e => {
                          const r = e.currentTarget.getBoundingClientRect()
                          setTagsPos({ contact: c, top: r.bottom + 4, left: r.left })
                        }}
                          className="w-5 h-5 rounded-md border border-white/15 flex items-center justify-center text-white/30 hover:text-white hover:border-white/30 transition-colors">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </td>

                    {/* Fecha Creación */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-white/40 text-xs">
                        <Calendar className="w-3.5 h-3.5 shrink-0 text-white/25" />
                        {created
                          ? new Date(created).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                          : '—'}
                      </div>
                    </td>

                    {/* Conversaciones */}
                    <td className="px-4 py-3">
                      <button onClick={e => {
                        const r = e.currentTarget.getBoundingClientRect()
                        setConvsPos({ contact: c, top: r.bottom + 4, left: r.left - 260 })
                      }}
                        className="flex items-center gap-1.5 text-white/40 text-xs hover:text-aria-300 transition-colors">
                        <MessageSquare className="w-3.5 h-3.5" />
                        {convCount}
                      </button>
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditContact(c)}
                          className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors" title="Editar">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(c)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-red-400/70 hover:text-red-300 hover:bg-red-400/10 transition-colors border border-red-400/20 hover:border-red-400/40"
                          title="Eliminar">
                          <Trash2 className="w-3 h-3" /> Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modals ── */}
      {showTags && (
        <TagsModal
          projectId={projectId}
          onClose={() => setShowTags(false)}
          onChanged={() => refetchLabels()}
        />
      )}
      {showNew && (
        <ContactModal
          projectId={projectId}
          labels={labels}
          onClose={() => setShowNew(false)}
          onCreated={() => setRefreshKey(k => k + 1)}
        />
      )}
      {editContact && (
        <ContactModal
          projectId={projectId}
          labels={labels}
          contact={editContact}
          onClose={() => setEditContact(null)}
          onCreated={() => setRefreshKey(k => k + 1)}
        />
      )}
      {tagsPos && (
        <TagsPopover
          contact={tagsPos.contact}
          labels={labels}
          labelColorMap={labelColorMap}
          projectId={projectId}
          pos={tagsPos}
          onClose={() => setTagsPos(null)}
          onUpdated={() => setRefreshKey(k => k + 1)}
        />
      )}
      {convsPos && (
        <ConvsPopover
          contact={convsPos.contact}
          projectId={projectId}
          pos={convsPos}
          onClose={() => setConvsPos(null)}
        />
      )}
    </div>
  )
}
