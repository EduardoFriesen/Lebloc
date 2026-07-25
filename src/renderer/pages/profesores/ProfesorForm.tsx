import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Profesor } from '../../types'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

interface ProfesorFormProps {
  isOpen: boolean
  onClose: () => void
  profesor?: Profesor | null
  onSubmit: (data: any) => Promise<void>
}

export function ProfesorForm({ isOpen, onClose, profesor, onSubmit }: ProfesorFormProps) {
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm()

  useEffect(() => {
    if (profesor) reset(profesor)
    else reset({ nombre: '', apellido: '', telefono: '', email: '' })
  }, [profesor, reset, isOpen])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={profesor ? 'Editar Profesor' : 'Nuevo Profesor'} size="md">
      <form onSubmit={handleSubmit(async (data) => { await onSubmit(data); onClose() })} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Nombre" {...register('nombre', { required: true })} />
          <Input label="Apellido" {...register('apellido', { required: true })} />
        </div>
        <Input label="Telefono" {...register('telefono')} />
        <Input label="Email" type="email" {...register('email')} />
        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button type="submit" disabled={isSubmitting}>{profesor ? 'Guardar' : 'Crear'}</Button>
        </div>
      </form>
    </Modal>
  )
}
