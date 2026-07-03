import { useRef, useEffect } from 'react'
import * as THREE from 'three'

// Interactive dotted background: a grid of dots that gently repel away from the
// cursor as it moves over the panel, easing back when the mouse leaves.
export default function LoginDotGrid({ className = 'absolute inset-0' }) {
  const mountRef = useRef(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const panel = mount.parentElement || mount

    let width = mount.clientWidth || 1
    let height = mount.clientHeight || 1
    let aspect = width / height

    const scene = new THREE.Scene()
    // Orthographic so grid maps cleanly to screen space; view spans y[-1,1], x[-aspect,aspect]
    const camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10)
    camera.position.z = 1

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    mount.appendChild(renderer.domElement)

    const GAP = 0.038          // spacing between dots (world units)
    const RADIUS = 0.34        // cursor influence radius
    const STRENGTH = 0.16      // how far dots get pushed
    const EASE = 0.12          // return / follow easing

    let base = null            // Float32Array of rest positions
    let positions = null       // BufferAttribute array (live)
    let geometry = null
    let material = null
    let points = null

    const buildGrid = () => {
      if (points) {
        scene.remove(points)
        geometry.dispose()
        material.dispose()
      }
      const cols = Math.ceil((aspect * 2) / GAP) + 1
      const rows = Math.ceil(2 / GAP) + 1
      const count = cols * rows
      base = new Float32Array(count * 3)
      positions = new Float32Array(count * 3)
      let i = 0
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = -aspect + c * GAP
          const y = -1 + r * GAP
          base[i * 3] = x
          base[i * 3 + 1] = y
          base[i * 3 + 2] = 0
          positions[i * 3] = x
          positions[i * 3 + 1] = y
          positions[i * 3 + 2] = 0
          i++
        }
      }
      geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      material = new THREE.PointsMaterial({ color: 0xd0d0d6, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.7 })
      points = new THREE.Points(geometry, material)
      scene.add(points)
    }
    buildGrid()

    // Cursor position in world units; start far away so nothing reacts until hover
    const mouse = new THREE.Vector2(999, 999)
    const onMove = (e) => {
      const rect = panel.getBoundingClientRect()
      const px = (e.clientX - rect.left) / rect.width
      const py = (e.clientY - rect.top) / rect.height
      mouse.set((px * 2 - 1) * aspect, -(py * 2 - 1))
    }
    const onLeave = () => mouse.set(999, 999)
    panel.addEventListener('pointermove', onMove)
    panel.addEventListener('pointerleave', onLeave)

    let raf
    const animate = () => {
      const arr = geometry.attributes.position.array
      for (let i = 0; i < arr.length; i += 3) {
        const bx = base[i]
        const by = base[i + 1]
        const dx = bx - mouse.x
        const dy = by - mouse.y
        const dist = Math.hypot(dx, dy)
        let tx = bx
        let ty = by
        if (dist < RADIUS && dist > 0.0001) {
          const force = (1 - dist / RADIUS) * STRENGTH
          tx = bx + (dx / dist) * force
          ty = by + (dy / dist) * force
        }
        arr[i] += (tx - arr[i]) * EASE
        arr[i + 1] += (ty - arr[i + 1]) * EASE
      }
      geometry.attributes.position.needsUpdate = true
      renderer.render(scene, camera)
      raf = requestAnimationFrame(animate)
    }
    animate()

    const onResize = () => {
      width = mount.clientWidth || 1
      height = mount.clientHeight || 1
      aspect = width / height
      camera.left = -aspect
      camera.right = aspect
      camera.top = 1
      camera.bottom = -1
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
      buildGrid()
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(mount)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      panel.removeEventListener('pointermove', onMove)
      panel.removeEventListener('pointerleave', onLeave)
      renderer.dispose()
      geometry?.dispose()
      material?.dispose()
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={mountRef} className={className} aria-hidden />
}
