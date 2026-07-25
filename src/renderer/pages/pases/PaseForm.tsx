import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Pase } from '../../types'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

interface PaseFormProps {
  isOpen: boolean
  onClose: () => void
  pase?: Pase | null
  onSubmit: (data: any) => Promise<void>
}

export function PaseForm({ isOpen, onClose, pase, onSubmit }: PaseFormProps) {
  const { register, handleSubmit, reset, watch, formState: { isSubmitting } } = useForm()
  const esDiario = watch('esDiario')

  useEffect(() => {
    if (pase) {
      reset(pase)
    } else {
      reset({ nombre: '', clasesSemanales: 1, precio: 0, recargoProfesor: 0, esDiario: 0 })
    }
  }, [pase, reset, isOpen])

  const handleFormSubmit = async (data: any) => {
    await onSubmit({ ...data, clasesSemanales: Number(data.clasesSemanales), precio: Number(data.precio), recargoProfesor: Number(data.recargoProfesor) })
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={pase ? 'Editar Pase' : 'Nuevo Pase'} size="md">
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <Input label="Nombre del Pase" {...register('nombre', { required: true })} placeholder="Ej: 2x semana, Diario" />

        {!esDiario && (
          <Input label="Clases por Semana" type="number" min="1" {...register('clasesSemanales', { required: true })} />
        )}

        <Input label="Precio" type="number" min="0" step="0.01" {...register('precio', { required: true })} />
        <Input label="Recargo Profesor" type="number" min="0" step="0.01" {...register('recargoProfesor')} />

        <div className="flex items-center gap-3 py-2">
          <input type="checkbox" id="esDiario" {...register('esDiario')} className="w-4 h-4 rounded border-border text-accent focus:ring-accent/30" />
          <label htmlFor="esDiario" className="text-sm font-medium text-ink">Pase diario (no se asocia a cliente)</label>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button type="submit" disabled={isSubmitting}>{pase ? 'Guardar' : 'Crear Pase'}</Button>
        </div>
      </form>
    </Modal>
  )
}
