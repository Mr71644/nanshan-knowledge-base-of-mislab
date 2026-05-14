import ReactHtmlParser from 'react-html-parser'

const HtmlContent = ({ content, className }) => { // eslint-disable-line react/prop-types
    if (!content) return null

    return (
        <div className={className}>
            {ReactHtmlParser(content, {
                decodeEntities: true,
            })}
        </div>
    )
}

export default HtmlContent
