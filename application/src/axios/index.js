import Axios from 'axios'

const Server = Axios.create({
  baseURL: '/api'
})

export default Server
