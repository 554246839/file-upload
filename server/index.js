// 导入koa，和koa 1.x不同，在koa2中，我们导入的是一个class，因此用大写的Koa表示:
const Koa = require('koa');
const router = require('koa-router')()
const fs = require('fs')
const path = require('path')
const koaBody = require('koa-body') //解析上传文件的插件
const static = require('koa-static')

const uploadPath = path.join(__dirname, 'public/uploads') // 文件上传目录

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath)
}

// 创建一个Koa对象表示web app本身:
const app = new Koa();

app.use(static('public', {
  maxAge: 30 * 24 * 3600 * 1000 // 静态资源缓存时间 ms
}));

app.use(koaBody({
  multipart: true,
  formidable: {
    uploadDir: uploadPath,
    maxFileSize: 10000 * 1024 * 1024    // 设置上传文件大小最大限制，默认20M
  }
}))

// 对于任何请求，app将调用该异步函数处理请求：
app.use(async (ctx, next) => {
  console.log(`Process ${ctx.request.method} ${ctx.request.url}...`);

  ctx.set('Access-Control-Allow-Origin', '*');//*表示可以跨域任何域名都行 也可以填域名表示只接受某个域名
  ctx.set('Access-Control-Allow-Headers', 'X-Requested-With,Content-Type,token');//可以支持的消息首部列表
  ctx.set('Access-Control-Allow-Methods', 'PUT,POST,GET,DELETE,OPTIONS');//可以支持的提交方式
  ctx.set('Content-Type', 'application/json;charset=utf-8');//请求头中定义的类型

  if (ctx.request.method === 'OPTIONS') {
    ctx.response.status = 200
  }

  try {
    await next();
  } catch (err) {
    console.log(err, 'errmessage')
    ctx.response.status = err.statusCode || err.status || 500
    ctx.response.body = {
      errcode: 500,
      msg: err.message
    }
    ctx.app.emit('error', err, ctx);
  }
})

router.post('/api/upload/file', function uploadFile(ctx) {
  const files = ctx.request.files
  const filePath = path.join(uploadPath, files.file.name)

  // 创建可读流
  const reader = fs.createReadStream(files['file']['path']);
  // 创建可写流
  const upStream = fs.createWriteStream(filePath);
  // 可读流通过管道写入可写流
  reader.pipe(upStream);

  ctx.response.body = {
    code: 0,
    url: path.join('http://localhost:3000/uploads', files.file.name),
    msg: '文件上传成功'
  }
})

router.post('/api/upload/snippet', function snippet(ctx) {
  let files = ctx.request.files
  const { index, hash } = ctx.request.body

  // 切片上传目录
  const chunksPath = path.join(uploadPath, hash, '/')

  if(!fs.existsSync(chunksPath)) {
    fs.mkdirSync(chunksPath)
  }

  // 切片文件
  const chunksFileName = chunksPath + hash + '-' + index
  
  // 秒传，如果切片已上传，则立即返回
  if (fs.existsSync(chunksFileName)) {
    console.log('秒传')
    ctx.response.body = {
      code: 0,
      msg: '切片上传完成'
    }
    return
  }
  // 创建可读流
  const reader = fs.createReadStream(files.file.path);
  // 创建可写流
  const upStream = fs.createWriteStream(chunksFileName);
  // // 可读流通过管道写入可写流
  reader.pipe(upStream);

  reader.on('end', () => {
    // 文件上传成功后，删除本地切片
    fs.unlinkSync(files.file.path)
  })
    
  ctx.response.body = {
    code: 0,
    msg: '切片上传完成'
  }
})

/**
 * 1、判断是否有切片hash文件夹
 * 2、判断文件夹内的文件数量是否等于total
 * 4、然后合并切片
 * 5、删除切片文件信息
 */
router.post('/api/upload/merge', function uploadFile(ctx) {
  const { total, hash, name } = ctx.request.body
  const dirPath = path.join(uploadPath, hash, '/')
  const filePath = path.join(uploadPath, name) // 合并文件

  // 已存在文件，则表示已上传成功
  if (fs.existsSync(filePath)) {
    ctx.response.body = {
      code: 0,
      url: path.join('http://localhost:3000/uploads', name),
      msg: '文件上传成功'
    }
  // 如果没有切片hash文件夹则表明上传失败
  } else if (!fs.existsSync(dirPath)) {
    ctx.response.body = {
      code: -1,
      msg: '文件上传失败'
    }
  } else {
    const chunks = fs.readdirSync(dirPath) // 读取所有切片文件
    fs.createWriteStream(filePath) // 创建可写存储文件
    
    if(chunks.length !== total || !chunks.length) {
      ctx.response.body = {
        code: -1,
        msg: '上传失败，切片数量不符'
      }
    }

    for(let i = 0; i < chunks.length; i++) {
      // 将切片追加到存储文件
      fs.appendFileSync(filePath, fs.readFileSync(dirPath + hash + '-' + i))
      // 然后删除切片
      fs.unlinkSync(dirPath + hash + '-' + i)
    }
    // 然后再删除切片文件夹
    fs.rmdirSync(dirPath)
    // 合并文件成功
    ctx.response.body = {
      code: 0,
      url: path.join('http://localhost:3000/uploads', name),
      msg: '文件上传成功'
    }
  }
})

app.on('error', err => {
  console.error(err)
})

app.use(router.routes())

// 在端口3000监听:
app.listen(3000);
console.log('app started at port 3000...');