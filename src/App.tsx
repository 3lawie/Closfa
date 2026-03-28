import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <div className="h-full flex flex-col gap-[250px] relative top-[200px] mb-[200px] p-10">
        <video src="videos/زيارة.mp4" controls
          className='rounded-2xl w-[500px] h-[600px] object-contain m-auto'></video>
        <video src="videos/3 HOUR STUDY WITH ME  Background noise, Rain Sounds, 10-min break, No Music - Merve (1080p, h264, youtube).mp4"
          controls
          className='border-2 rounded-2xl'></video>
      </div>
    </>
  )
}

export default App
