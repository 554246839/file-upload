const Koa = require('koa')
const router = require('koa-router')() // koa路由模块
const koaBody = require('koa-body') //解析文件上传的插件
const fs = require('fs') // nodeJs内置文件模块
const path = require('path') // nodeJs内置路径模块

const uploadPath = path.join(__dirname, 'public/uploads') // 定义文件上传目录

// 如果初始没有改文件目录，则自动创建
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath)
}

const app = new Koa() // 实例化

// 一些自定义的全局请求处理
app.use(async (ctx, next) => {
  console.log(`Process ${ctx.request.method} ${ctx.request.url}...`);

  if (ctx.request.method === 'OPTIONS') {
    ctx.status = 200
  }

  try {
    await next();
  } catch (err) {
    ctx.status = err.statusCode || err.status || 500
    ctx.body = {
      code: 500,
      msg: err.message
    }
  }
})

// 加载文件上传中间件
app.use(koaBody({
  multipart: true,
  formidable: {
    // keepExtensions: true, // 保持文件后缀
    uploadDir: uploadPath, // 初始指定文件存放地址，否则将会放入系统临时文件目录
    maxFileSize: 10000 * 1024 * 1024    // 设置上传文件大小最大限制，默认20M
  }
}))

// 文件上传处理
function uploadFn(ctx, destPath) {
  return new Promise((resolve, reject) => {
    const { name, path: _path } = ctx.request.files.file // 拿到上传的文件信息
    const filePath = destPath || path.join(uploadPath, name) // 重新组合文件名

    // 将临时文件重新设置文件名及地址
    fs.rename(_path, filePath, (err) => {
      if (err) {
        return reject(err)
      }
      resolve(filePath)
    })
  })
}

// 查询分片文件是否上传
router.post('/api/upload/checkSnippet', function snippet(ctx) {
  const { hash } = ctx.request.body

  // 切片上传目录
  const chunksPath = path.join(uploadPath, hash, '/')

  let chunksFiles = []

  if(fs.existsSync(chunksPath)) {
    // 切片文件
    chunksFiles = fs.readdirSync(chunksPath)
  }

  ctx.body = {
    code: 0,
    data: chunksFiles,
    msg: '查询成功'
  }
})

// 分片文件上传接口
router.post('/api/upload/snippet', async function snippet(ctx) {
  const { index, hash } = ctx.request.body

  // 切片上传目录
  const chunksPath = path.join(uploadPath, hash, '/')

  if(!fs.existsSync(chunksPath)) {
    fs.mkdirSync(chunksPath)
  }

  // 切片文件
  const chunksFileName = chunksPath + hash + '-' + index
  
  await uploadFn(ctx, chunksFileName).then(name => {
    ctx.body = {
      code: 0,
      msg: '切片上传完成',
      data: name
    }
  }).catch(err => {
    ctx.body = {
      code: -1,
      msg: '切片上传失败',
      data: err
    }
  })
})

// 文件上传接口
router.post('/api/upload/file', async function uploadFile(ctx) {
  await uploadFn(ctx).then((name) => {
    ctx.body = {
      code: 0,
      url: path.join('http://localhost:3000/uploads', name),
      msg: '文件上传成功'
    }
  }).catch(err => {
    ctx.body = {
      code: -1,
      msg: '文件上传失败'
    }
  })
})

// 删除文件夹及内部所有文件
function deleteFiles(dirpath) {
  if (fs.existsSync(dirpath)) {
    fs.readdir(dirpath, (err, files) => {
      if (err) throw err
      // 删除文件
      while(files.length) {
        fs.unlinkSync(dirpath + files.shift())
      }
      // 删除目录
      fs.rmdir(dirpath, () => {})
    })
  }
}
/**
 * 文件异步合并
 * @param {String} dirPath 分片文件夹
 * @param {String} filePath 目标文件
 * @param {String} hash 文件hash
 * @param {Number} total 分片文件总数
 * @returns {Promise}
 */
function mergeFile(dirPath, filePath, hash, total) {
  return new Promise((resolve, reject) => {
    fs.readdir(dirPath, (err, files) => {
      if (err) {
        return reject(err)
      }
      if(files.length !== total || !files.length) {
        return reject('上传失败，切片数量不符')
      }

      // 创建文件写入流
      const fileWriteStream = fs.createWriteStream(filePath)
      function merge(i) {
        return new Promise((res, rej) => {
          // 合并完成
          if (i === files.length) {
            fs.rmdir(dirPath, (err) => {
              console.log(err, 'rmdir')
            })
            return res()
          }
          const chunkpath = dirPath + hash + '-' + i
          fs.readFile(chunkpath, (err, data) => {
            if (err) return rej(err)

            // 将切片追加到存储文件
            fs.appendFile(filePath, data, () => {
              // 删除切片文件
              fs.unlink(chunkpath, () => {
                // 递归合并
                res(merge(i + 1))
              })
            })
          })

        })
      }
      merge(0).then(() => {
        // 默认情况下不需要手动关闭，但是在某些文件的合并并不会自动关闭可写流，比如压缩文件，所以这里在合并完成之后，统一关闭下
        resolve(fileWriteStream.close())
      })
    })
  })
}

/**
 * 文件合并接口
 * 1、判断是否有切片hash文件夹
 * 2、判断文件夹内的文件数量是否等于total
 * 4、然后合并切片
 * 5、删除切片文件信息
 */
router.post('/api/upload/merge', async function uploadFile(ctx) {
  const { total, hash, name } = ctx.request.body
  const dirPath = path.join(uploadPath, hash, '/')
  const filePath = path.join(uploadPath, name) // 合并文件

  // 已存在文件，则表示已上传成功
  if (fs.existsSync(filePath)) {
    // 删除所有的临时文件
    deleteFiles(dirPath)
    ctx.body = {
      code: 0,
      url: path.join('http://localhost:3000/uploads', name),
      msg: '文件上传成功'
    }
  // 如果没有切片hash文件夹则表明上传失败
  } else if (!fs.existsSync(dirPath)) {
    ctx.body = {
      code: -1,
      msg: '文件上传失败'
    }
  } else {
    // 开始合并
    await mergeFile(dirPath, filePath, hash, total).then(() => {
      ctx.body = {
        code: 0,
        url: path.join('http://localhost:3000/uploads', name),
        msg: '文件上传成功'
      }
    }).catch(err => {
      ctx.body = {
        code: -1,
        msg: err
      }
    })
  }
})

app.use(router.routes())

// 用端口3000启动服务
app.listen(3000)