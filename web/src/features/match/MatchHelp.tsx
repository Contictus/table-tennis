import { Gamepad2, MousePointer2, X } from 'lucide-react'
import IconButton from '../../shared/ui/IconButton'

interface Props { onClose: () => void }

export default function MatchHelp({ onClose }: Props) {
  return <section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" aria-describedby="help-description">
    <header className="help-header"><div><div className="eyebrow">QUICK GUIDE</div><h2 id="help-title">Play the rally.</h2></div><IconButton label="Close help" onClick={onClose} autoFocus><X size={18} /></IconButton></header>
    <p id="help-description" className="help-description">Keep the ball on the table and return it before it reaches your side.</p>
    <div className="help-list">
      <div className="help-row"><MousePointer2 size={19} /><div><strong>Drag to move</strong><span>Use your mouse or finger across the table area.</span></div></div>
      <div className="help-row"><Gamepad2 size={19} /><div><strong>First to 11</strong><span>The server changes every two points. The server controls the rally start.</span></div></div>
    </div>
    <button className="help-dismiss" onClick={onClose}>Back to match</button>
  </section>
}
