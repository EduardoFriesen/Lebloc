import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Cliente } from '../../types'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { motion } from 'framer-motion'

interface ClienteFormProps {
  isOpen: boolean
  onClose: () => void
  cliente?: Cliente | null
  onSubmit: (data: any) => Promise<void>
}

export function ClienteForm({ isOpen, onClose, cliente, onSubmit }: ClienteFormProps) {
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm()
  const esMenor = watch('esMenor')

  useEffect(() => {
    if (cliente) {
      reset(cliente)
    } else {
      reset({
        nombre: '', apellido: '', dni: '', telefono: '',
        fechaNacimiento: '', esMenor: 0,
        telefonoResponsable: '', contactoEmergencia: '',
        fechaIngreso: new Date().toISOString().split('T')[0],
      })
    }
  }, [cliente, reset, isOpen])

  const handleFormSubmit = async (data: any) => {
    await onSubmit(data)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={cliente ? 'Editar Cliente' : 'Nuevo Cliente'} size="lg">
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-2 gap-4"
        >
          <Input
            label="Nombre"
            error={errors.nombre?.message as string}
            {...register('nombre', { required: 'El nombre es obligatorio' })}
          />
          <Input
            label="Apellido"
            error={errors.apellido?.message as string}
            {...register('apellido', { required: 'El apellido es obligatorio' })}
          />
        </motion.div>

        <div className="grid grid-cols-2 gap-4">
          <Input label="DNI" {...register('dni')} />
          <Input label="Teléfono" {...register('telefono')} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input label="Fecha de Nacimiento" type="date" {...register('fechaNacimiento')} />
          <Input label="Fecha de Ingreso" type="date" {...register('fechaIngreso')} />
        </div>

        <div className="flex items-center gap-3 py-2">
          <input
            type="checkbox"
            id="esMenor"
            {...register('esMenor')}
            className="w-4 h-4 rounded border-border text-accent focus:ring-accent/30"
          />
          <label htmlFor="esMenor" className="text-sm font-medium text-ink">Es menor de edad</label>
        </div>

        {esMenor ? (
          <Input label="Teléfono del Adulto Responsable" {...register('telefonoResponsable')} />
        ) : (
          <Input label="Contacto de Emergencia" {...register('contactoEmergencia')} />
        )}

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : cliente ? 'Guardar Cambios' : 'Crear Cliente'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
