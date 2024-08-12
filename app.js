const express = require('express')
const cors = require('cors')
const app = express()

const corsOptions = {
  origin: 'http://localhost:3000',
  optionsSuccessStatus: 200,
}

app.use(cors(corsOptions))
app.use(express.json())

app.use(express.urlencoded({ extended: true }))

app.listen(5000, () => {
  console.log('server started on port 5000')
})
