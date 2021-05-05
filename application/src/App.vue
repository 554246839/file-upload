<template>
  <div>
    <input type="file" @change="uploadFile">
  </div>
</template>

<script>
// import SparkMD5 from 'spark-md5'
import Worker from './hash.worker.js'

export default {
  data() {
    return {
      fileInfo: null,
      chunkSize: 100 * 1024 // 切片大小
    }
  },
  methods: {
    // input改变事件监听
    uploadFile(e) {
      const file = e.target.files[0]
      // 如果文件大小大于文件分片大小的5倍才使用分片上传
      if (file.size / this.chunkSize < 5) {
        this.sendFile(file)
        return
      }
      this.createFileMd5(file).then(async fileMd5 => {
        // 先查询服务器是否已有上传完的文件切片
        let {data} = await this.getUploadedChunks(fileMd5)
        let uploaded = data.data.length ? data.data.map(v => v.split('-')[1] - 0) : []
        // 切割文件
        const chunkArr = await this.cutBlob(fileMd5, file, uploaded)
        // 开始上传
        this.sendRequest(chunkArr, 5, this.chunkMerge)
      })
    },
    createFileMd5(file) {
      return new Promise((resolve) => {
        const worker = new Worker()

        worker.postMessage({file, chunkSize: this.chunkSize})

        worker.onmessage = event => {
          resolve(event.data)
        }
      })
    },
    // 文件分割
    cutBlob(fileHash, file, uploaded) {
      const chunkArr = [] // 所有切片缓存数组
      const blobSlice = File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice
      const chunkNums = Math.ceil(file.size / this.chunkSize) // 切片总数

      return new Promise(resolve => {
        let startIndex = ''
        let endIndex = ''
        let contentItem = ''

        for(let i = 0; i < chunkNums; i++) {
          // 如果已上传则跳过
          if (uploaded.includes(i)) continue

          startIndex = i * this.chunkSize // 片段起点
          endIndex = (i + 1) * this.chunkSize // 片段尾点
          endIndex > file.size && (endIndex = file.size)

          // 切割文件
          contentItem = blobSlice.call(file, startIndex, endIndex)

          chunkArr.push({
            index: i,
            chunk: contentItem
          })
        }
        this.fileInfo = {
          hash: fileHash,
          total: chunkNums,
          name: file.name,
          size: file.size
        }
        resolve(chunkArr)
      })
    },
    // 请求并发处理
    sendRequest(arr, max = 6, callback) {
      let fetchArr = []

      let toFetch = () => {
        if (!arr.length) {
          return Promise.resolve()
        }

        const chunkItem = arr.shift()

        const it = this.sendChunk(chunkItem)
        it.then(() => {
          // 成功从任务队列中移除
          fetchArr.splice(fetchArr.indexOf(it), 1)
        }, err => {
          // 如果失败则重新放入总队列中
          arr.unshift(chunkItem)
          console.log(err)
        })
        fetchArr.push(it)

        let p = Promise.resolve()
        if (fetchArr.length >= max) {
          p = Promise.race(fetchArr)
        }

        return p.then(() => toFetch())
      }

      toFetch().then(() => {
        Promise.all(fetchArr).then(() => {
          callback()
        })
      }, err => {
        console.log(err)
      })
    },
    // 请求已上传文件
    getUploadedChunks(hash) {
      return this.$http({
        url: "/upload/checkSnippet",
        method: "post",
        data: { hash }
      })
    },
    // 小文件上传
    sendChunk(item) {
      if (!item) return
      let formdata = new FormData()
      formdata.append("file", item.chunk)
      formdata.append("index", item.index)
      formdata.append("hash", this.fileInfo.hash)
      // formdata.append("name", this.fileInfo.name)

      return this.$http({
        url: "/upload/snippet",
        method: "post",
        data: formdata,
        headers: { "Content-Type": "multipart/form-data" }
      })
    },
    // 文件上传方法
    sendFile(file) {
      let formdata = new FormData()
      formdata.append("file", file)

      this.$http({
        url: "/upload/file",
        method: "post",
        data: formdata,
        headers: { "Content-Type": "multipart/form-data" }
      }).then(({ data }) => {
        console.log(data, 'upload/file')
      })
    },
    // 请求合并
    chunkMerge() {
      this.$http({
        url: "/upload/merge",
        method: "post",
        data: this.fileInfo,
      }).then(res => {
        console.log(res.data)
      })
    }
  }
}
</script>
