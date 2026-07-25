import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { usePlanStore } from '../../stores/planStore'
import { Plan } from '../../types'
import { motion, AnimatePresence } from 'framer-motion'

interface AsistenciaButtonProps {
  plan: Plan
}

export function AsistenciaButton({ plan }: AsistenciaButtonProps) {
  const registrarAsistencia = usePlanStore((s) => s.registrarAsistencia)
  const [animating, setAnimating] = useState(false)

  const isLow = plan.pasesRestantes <= 2
  const isEmpty = plan.pasesRestantes <= 0

  const handleClick = async () => {
    setAnimating(true)
    await registrarAsistencia(plan.id)
    setTimeout(() => setAnimating(false), 300)
  }

  return (
    <div className="flex items-center gap-2">
      <AnimatePresence mode="wait">
        <motion.div
          key={plan.pasesRestantes}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Badge variant={isEmpty ? 'danger' : isLow ? 'warning' : 'success'}>
            {plan.pasesRestantes} restantes
          </Badge>
        </motion.div>
      </AnimatePresence>
      <Button
        size="sm"
        variant="ghost"
        disabled={isEmpty || animating}
        onClick={handleClick}
      >
        {animating ? '...' : '+ Asistencia'}
      </Button>
    </div>
  )
}
