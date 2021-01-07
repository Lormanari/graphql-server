const { ApolloServer, UserInputError, gql } = require('apollo-server')
const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')
const Author = require('./models/author')
const Book = require('./models/book')
const User = require('./models/user')
const DataLoader = require('dataloader')

const { PubSub } = require('apollo-server')
const pubsub = new PubSub()

mongoose.set('useFindAndModify', false)
const MONGODB_URI = 'mongodb+srv://fullstack:F1LpjDv7iNvMF2si@cluster0.emxpr.mongodb.net/graphql-book?retryWrites=true&w=majority'
mongoose.set('useCreateIndex', true)

console.log('connecting to', MONGODB_URI)

mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
	console.log('connected to MongoDB')
	// const author = new Author({
	// 	name: 'Fyodor Dostoevsky',
	// 	born: 1821
	//   })

	// await author.save()
	// await Book.deleteMany({})
  })
  .catch((error) => {
    console.log('error connection to MongoDB:', error.message)
  })



  const JWT_SECRET = 'SECRET_KEY'

const typeDefs = gql`
  type Book {
    title: String!
    published: Int!
    author: Author!
	id: ID!
	genres: [String!]
  }

  type Author {
    name: String!
	id: ID!
	born: Int
	bookCount: Int!
  }

  type User {
	username: String!
	favoriteGenre: String!
	id: ID!
  }

  type Token {
	value: String!
  }

  type Subscription {
	bookAdded: Book!
  }

  type Query {
	bookCount: Int!
	authorCount: Int!
	allBooks(author: String, genre: String): [Book!]!
	allAuthors: [Author!]!
	me: User
  }

  type Mutation {
	addBook(
		title: String!
		published: Int!
		author: String!
		genres: [String!]
	): Book
	editAuthor(
		name: String!
		born: Int!
	): Author
	createUser(
		username: String!
		favoriteGenre: String!
	): User
	login(
		username: String!
		password: String!
	): Token
  }
`

const resolvers = {
  Query: {
	  bookCount: () => Book.collection.countDocuments(),
	  authorCount: () => Author.collection.countDocuments(),
	  allBooks: async (root, args) => {
		try {
			// const books = await Book.find()
			// const filtedBooksByGenre = !args.genre? books: books.filter(b => b.genres.includes(args.genre))
			// return filtedBooksByGenre.map(book => ({
			// 	...book._doc,
			// 	author: authorPopulated.bind(this, book._doc.author)
			// }))
			if(!args.genre) {
				return Book.find({}).populate('author')
			}
			return Book.find({genres: {$in: [args.genre]}}).populate('author')
			} catch (error) {
			throw new UserInputError(error.message, {
				invalidArgs: args,
			})
			}

	  },
	  allAuthors: () => Author.find({}),
	  me: (root, args, context) => {
		 return context.currentUser
	  }
  },
  Author: {
	bookCount: (root, args, context) => {
		return context.bookCountLoader.load(root._id);
	}
  },
  Mutation: {
    addBook: async (root, args, context) => {
	  const book = new Book({ ...args })
	  const currentUser = context.currentUser

	  if (!currentUser) {
        throw new AuthenticationError("not authenticated")
	  }

	  try {
		const savedBook = await book.save()
		const populatedBook = savedBook.populate('author').execPopulate()
		pubsub.publish('BOOK_ADDED', { bookAdded: populatedBook })
		console.log(populatedBook)
		return populatedBook

      } catch (error) {
        throw new UserInputError(error.message, {
          invalidArgs: args,
		})
	  }

	},
	editAuthor: async (root, args, context) => {
		const author = await Author.findOne({ name:args.name })
		const currentUser = context.currentUser

		if (!currentUser) {
			throw new AuthenticationError("not authenticated")
		}

		author.born = args.born
		try {
			await author.save()
		} catch (error) {
			throw new UserInputError(error.message, {
			  invalidArgs: args,
			})
		}
		return author
	},
	createUser: (root, args) => {
		const user = new User({ ...args })

		return user.save()
		  .catch(error => {
			throw new UserInputError(error.message, {
			  invalidArgs: args,
			})
		})
	},
	login: async (root, args) => {
		const user = await User.findOne({ username: args.username })

		if ( !user || args.password !== 'secred' ) {
		  throw new UserInputError("wrong credentials")
		}

		const userForToken = {
		  username: user.username,
		  id: user._id,
		}

		return { value: jwt.sign(userForToken, JWT_SECRET) }
	},
  },
  Subscription: {
    bookAdded: {
      subscribe: () => pubsub.asyncIterator(['BOOK_ADDED'])
    },
  },
}

const bookCountLoader = new DataLoader(async (authorIds) => {
	const books = await Book.find({ author: { $in: authorIds }})
    return authorIds.map((id) => {
		const booksByAuthor = books.filter(b => String(b.author) === String(id))
		const booksLength = booksByAuthor.length || 0
		return booksLength
	});
});

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: async ({ req }) => {
	const auth = req ? req.headers.authorization : null
	if (auth && auth.toLowerCase().startsWith('bearer ')) {
	  const decodedToken = jwt.verify(
		auth.substring(7), JWT_SECRET
	  )
	  const currentUser = await User.findById(decodedToken.id)
	  return {
		  currentUser,
		  bookCountLoader
	  }
	} else {
		return {bookCountLoader}
	}
  }
})

server.listen().then(({ url, subscriptionsUrl }) => {
  console.log(`Server ready at ${url}`)
  console.log(`Subscriptions ready at ${subscriptionsUrl}`)
})