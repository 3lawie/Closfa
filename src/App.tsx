import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <div className="flex flex-col gap-[250px] relative top-[200px] ">
        <h1>a</h1>
        <h1>b</h1>
      </div>
    </>
  )
}

export default App
