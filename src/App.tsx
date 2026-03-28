import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <div className="flex flex-col gap-[250px] relative top-[200px] ">
        <video src=""></video>
        <video src=""></video>
      </div>
    </>
  )
}

export default App
